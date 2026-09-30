import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getD1 } from "../db/runtime.ts";

test("unreadable database is not replaced; a corrected path can recover without restart", async () => {
  const folder = await mkdtemp(join(tmpdir(), "ms-database-test-"));
  const unreadable = join(folder, "database-is-a-directory");
  await mkdir(unreadable);
  const originalPath = process.env.MS_BOUTIQUE_DB_PATH;
  try {
    process.env.MS_BOUTIQUE_DB_PATH = unreadable;
    await assert.rejects(getD1().prepare("SELECT 1").all());
    assert.equal((await stat(unreadable)).isDirectory(), true);
    process.env.MS_BOUTIQUE_DB_PATH = join(folder, "isolated-test.sqlite");
    const db = getD1();
    await db.prepare("CREATE TABLE test_items (id INTEGER PRIMARY KEY, name TEXT NOT NULL)").run();
    await db.prepare("INSERT INTO test_items (id,name) VALUES (?,?)").bind(1, "Test only").run();
    assert.equal((await db.prepare("SELECT name FROM test_items WHERE id=1").first()).name, "Test only");
    assert.ok((await readFile(process.env.MS_BOUTIQUE_DB_PATH)).length > 0);
  } finally {
    if (originalPath === undefined) delete process.env.MS_BOUTIQUE_DB_PATH;
    else process.env.MS_BOUTIQUE_DB_PATH = originalPath;
  }
});
