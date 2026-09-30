import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
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

// node:sqlite, present from Node 22.5, writes pages to the file as they change.
// The sql.js fallback below keeps the whole database in WASM memory and has to
// serialise all of it on every write, so it is only used where node:sqlite is
// missing. `engine` is logged once at startup so the running mode is visible in
// the host's runtime logs.
type NativeStatement = {
  all(...values: SqlValue[]): SqlRow[];
  run(...values: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
};

type NativeDatabase = {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): NativeStatement;
};

type RuntimeState = {
  database?: Promise<SqlJsDatabase>;
  native?: NativeDatabase;
  nativePath?: string;
  queue?: Promise<void>;
  announced?: boolean;
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

// Only statements that actually produce rows may go through `all()`.
const returnsRows = (sql: string) =>
  /^\s*(?:SELECT|WITH|VALUES)\b/i.test(sql) || /^\s*PRAGMA\s+table_info\b/i.test(sql) || /\bRETURNING\b/i.test(sql);

// SQLite hands back 64-bit integers, which Node surfaces as BigInt once they no
// longer fit a double. Everything downstream expects plain numbers.
const plain = (value: unknown): unknown => (typeof value === "bigint" ? Number(value) : value);

const plainRow = (row: SqlRow) => {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) out[key] = plain(row[key]);
  return out;
};

function announce(engine: string) {
  if (state.announced) return;
  state.announced = true;
  console.log(`[MS Boutique] database engine: ${engine} at ${databasePath()}`);
}

// This module is bundled as ESM, where `require` does not exist, so the built-in
// has to be pulled in with a dynamic import. Only a missing module falls back to
// sql.js; a database that will not open is a real error and must reach the caller
// rather than being silently swapped for a different engine.
let sqliteModule: { DatabaseSync: new (path: string) => NativeDatabase } | null | undefined;

async function loadSqlite() {
  if (sqliteModule !== undefined) return sqliteModule;
  try {
    const loaded = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "node:sqlite")) as unknown as {
      DatabaseSync?: new (path: string) => NativeDatabase;
      default?: { DatabaseSync?: new (path: string) => NativeDatabase };
    };
    const DatabaseSync = loaded.DatabaseSync ?? loaded.default?.DatabaseSync;
    sqliteModule = DatabaseSync ? { DatabaseSync } : null;
  } catch {
    sqliteModule = null;
  }
  return sqliteModule;
}

async function openNative(): Promise<NativeDatabase | undefined> {
  const loaded = await loadSqlite();
  if (!loaded) return undefined;
  const file = databasePath();
  // The path is read per call so a corrected MS_BOUTIQUE_DB_PATH takes effect
  // without a restart; a handle is bound to one file, so it is reopened.
  if (state.native && state.nativePath === file) return state.native;
  if (state.native) {
    try { state.native.close(); } catch { /* replacing it regardless */ }
    state.native = undefined;
    state.nativePath = undefined;
  }
  mkdirSync(dirname(file), { recursive: true });
  const database = new loaded.DatabaseSync(file);
  // WAL lets readers work while a write is in progress, and busy_timeout makes a
  // second process wait for the lock instead of failing the request outright.
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA busy_timeout = 8000");
  database.exec("PRAGMA foreign_keys = ON");
  state.native = database;
  state.nativePath = file;
  announce("node:sqlite");
  return database;
}

function runNative(database: NativeDatabase, sql: string, values: unknown[]) {
  const bound = values.map(normalize);
  const statement = database.prepare(sql);
  if (returnsRows(sql)) {
    return { rows: statement.all(...bound).map(plainRow), changes: 0, lastRowId: 0 };
  }
  const result = statement.run(...bound);
  return { rows: [] as Record<string, unknown>[], changes: Number(result.changes ?? 0), lastRowId: Number(result.lastInsertRowid ?? 0) };
}

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
      announce("sql.js (fallback)");
      return database;
    })().catch((error) => {
      // A temporary disk/WASM failure must not poison every subsequent request.
      state.database = undefined;
      throw error;
    });
  }
  return state.database;
}

async function saveDatabase(database: SqlJsDatabase) {
  const file = databasePath();
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, database.export());
  await rename(temporary, file);
}

function serial<T>(operation: () => Promise<T> | T): Promise<T> {
  const previous = state.queue ?? Promise.resolve();
  const result = previous.then(operation);
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
    return serial(async () => {
      const native = await openNative();
      if (native) {
        const { rows, changes, lastRowId } = runNative(native, this.sql, this.values);
        return { results: rows as unknown as T[], success: true as const, meta: { changes, last_row_id: lastRowId } };
      }
      const database = await openDatabase();
      const { rows, changes } = execute(database, this.sql, this.values);
      if (mutatesDatabase(this.sql)) await saveDatabase(database);
      return { results: rows as unknown as T[], success: true as const, meta: { changes, last_row_id: 0 } };
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
    return serial(async () => {
      const native = await openNative();
      if (native) {
        const results: D1Result<T>[] = [];
        native.exec("BEGIN IMMEDIATE");
        try {
          for (const statement of statements) {
            const { rows, changes, lastRowId } = runNative(native, statement.sql, statement.values);
            results.push({ results: rows as unknown as T[], success: true, meta: { changes, last_row_id: lastRowId } });
          }
          native.exec("COMMIT");
          return results;
        } catch (error) {
          try { native.exec("ROLLBACK"); } catch { /* preserve original error */ }
          throw error;
        }
      }
      const database = await openDatabase();
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

let mintedOwnerPassword: string | undefined;

// The owner password is never a literal in the source: this repository is public,
// so a default here would be a published credential. It comes from OWNER_PASSWORD
// (.env.local locally, the host's environment in production). With none set the
// first boot mints a one-time password and prints it, so a fresh install is still
// reachable without publishing anything.
export function ownerBootstrapPassword(): string {
  const configured = process.env.OWNER_PASSWORD;
  if (typeof configured === "string" && configured.trim().length >= 8) return configured.trim();
  if (!mintedOwnerPassword) {
    mintedOwnerPassword = randomBytes(9).toString("base64url");
    console.warn(
      `\n[MS Boutique] OWNER_PASSWORD is not set.\n` +
      `[MS Boutique] Owner account created with a one-time password: ${mintedOwnerPassword}\n` +
      `[MS Boutique] Sign in as "Admin", then set OWNER_PASSWORD to choose your own.\n`
    );
  }
  return mintedOwnerPassword;
}
