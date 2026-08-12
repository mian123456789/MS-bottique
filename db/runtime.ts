import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

type SqlValue = string | number | Uint8Array | null;
type SqlRow = Record<string, SqlValue>;

type SqlJsStatement = {
  bind(values?: SqlValue[]): boolean;
  free(): boolean;
  getAsObject(): SqlRow;
  step(): boolean;
};

type SqlJsDatabase = {
  close(): void;
  export(): Uint8Array;
  getRowsModified(): number;
  prepare(sql: string): SqlJsStatement;
  run(sql: string, values?: SqlValue[]): SqlJsDatabase;
};

type SqlJsStatic = {
  Database: new (data?: Uint8Array) => SqlJsDatabase;
};

export type D1Result<T = Record<string, unknown>> = {
  results: T[];
  success: true;
  meta: { changes: number; last_row_id: number };
};

type RuntimeState = {
  database?: Promise<SqlJsDatabase>;
  queue?: Promise<void>;
};

const runtime = globalThis as typeof globalThis & { __msBoutiqueDatabase?: RuntimeState };
runtime.__msBoutiqueDatabase ??= {};
const state = runtime.__msBoutiqueDatabase;

const databasePath = () =>
  process.env.MS_BOUTIQUE_DB_PATH?.trim() ||
  join(/* turbopackIgnore: true */ process.env.HOME || process.cwd(), ".ms-boutique-data", "ms-boutique.sqlite");

const normalize = (value: unknown): SqlValue => {
  if (value == null) return null;
  if (value instanceof Uint8Array) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" || typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

const mutatesDatabase = (sql: string) =>
  /^\s*(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|REINDEX|ANALYZE)\b/i.test(sql) ||
  /^\s*PRAGMA\s+(?!table_info\b)/i.test(sql);

async function openDatabase() {
  if (!state.database) {
    state.database = (async () => {
      const sqlJsModule = await import("sql.js");
      const initialize = sqlJsModule.default as unknown as (options?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>;
      const SQL = await initialize({
        locateFile: () => join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
      });
      const file = databasePath();
      await mkdir(dirname(file), { recursive: true });
      let bytes: Uint8Array | undefined;
      try { bytes = new Uint8Array(await readFile(file)); } catch { /* first boot */ }
      const database = new SQL.Database(bytes);
      database.run("PRAGMA foreign_keys=ON");
      return database;
    })();
  }
  return state.database;
}

async function saveDatabase(database: SqlJsDatabase) {
  const file = databasePath();
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, database.export());
  await rename(temporary, file);
}

function serial<T>(operation: (database: SqlJsDatabase) => Promise<T> | T): Promise<T> {
  const previous = state.queue ?? Promise.resolve();
  const result = previous.then(async () => operation(await openDatabase()));
  state.queue = result.then(() => undefined, () => undefined);
  return result;
}

function execute(database: SqlJsDatabase, sql: string, values: unknown[]) {
  const statement = database.prepare(sql);
  const rows: SqlRow[] = [];
  try {
    statement.bind(values.map(normalize));
    while (statement.step()) rows.push(statement.getAsObject());
  } finally {
    statement.free();
  }
  return { rows, changes: database.getRowsModified() };
}

export class D1PreparedStatement {
  readonly sql: string;
  readonly values: unknown[];

  constructor(sql: string, values: unknown[] = []) {
    this.sql = sql;
    this.values = values;
  }

  bind(...values: unknown[]) {
    return new D1PreparedStatement(this.sql, values);
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return serial(async (database) => {
      const { rows, changes } = execute(database, this.sql, this.values);
      if (mutatesDatabase(this.sql)) await saveDatabase(database);
      return { results: rows as unknown as T[], success: true, meta: { changes, last_row_id: 0 } };
    });
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const result = await this.all<T>();
    const row = result.results[0];
    if (!row) return null;
    return column ? ((row as Record<string, unknown>)[column] as T) : row;
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.all<T>();
  }
}

export class D1Database {
  prepare(sql: string) {
    return new D1PreparedStatement(sql);
  }

  async batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    return serial(async (database) => {
      const results: D1Result<T>[] = [];
      database.run("BEGIN IMMEDIATE");
      try {
        for (const statement of statements) {
          const output = execute(database, statement.sql, statement.values);
          results.push({
            results: output.rows as unknown as T[],
            success: true,
            meta: { changes: output.changes, last_row_id: 0 },
          });
        }
        database.run("COMMIT");
        if (statements.some((statement) => mutatesDatabase(statement.sql))) await saveDatabase(database);
        return results;
      } catch (error) {
        try { database.run("ROLLBACK"); } catch { /* preserve original error */ }
        throw error;
      }
    });
  }
}

const database = new D1Database();

export function getD1(): D1Database {
  return database;
}

export function ownerBootstrapPassword(): string {
  const configured = process.env.OWNER_PASSWORD;
  if (typeof configured === "string" && configured.trim().length >= 8) return configured.trim();
  return "Admin&8687";
}
