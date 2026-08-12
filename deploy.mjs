#!/usr/bin/env node
// One-command deploy to Cloudflare Workers.
//
//   npx wrangler login      (once, opens a browser)
//   node deploy.mjs
//
// Creates the D1 database if it does not exist, builds, points the generated
// worker config at the real database, and deploys. Safe to run repeatedly.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const DB_NAME = process.env.D1_DATABASE_NAME ?? "ms-boutique";
const CONFIG = "dist/server/wrangler.json";

const run = (args, { capture = false, allowFail = false } = {}) => {
  try {
    const out = execFileSync("npx", ["--yes", "wrangler", ...args], {
      encoding: "utf8",
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      shell: process.platform === "win32",
    });
    return out ?? "";
  } catch (error) {
    if (allowFail) return "";
    console.error(`\n✖ wrangler ${args.join(" ")} failed.`);
    if (error.stdout) console.error(String(error.stdout));
    if (error.stderr) console.error(String(error.stderr));
    process.exit(1);
  }
};

const step = (message) => console.log(`\n▸ ${message}`);

// 1. Confirm we are signed in before doing anything that costs time.
step("Checking Cloudflare sign-in");
const who = run(["whoami"], { capture: true, allowFail: true });
if (!who || /not authenticated/i.test(who)) {
  console.error("\n✖ Not signed in to Cloudflare.\n  Run this once, then try again:\n\n    npx wrangler login\n");
  process.exit(1);
}
console.log(who.split("\n").filter((line) => line.includes("@") || line.includes("Account")).slice(0, 3).join("\n") || "signed in");

// 2. Reuse the database if it is already there; create it the first time.
step(`Ensuring D1 database "${DB_NAME}" exists`);
let databaseId = "";
const listed = run(["d1", "list", "--json"], { capture: true, allowFail: true });
try {
  const match = JSON.parse(listed).find((row) => row.name === DB_NAME);
  if (match) databaseId = match.uuid ?? match.database_id ?? "";
} catch { /* fall through to create */ }

if (!databaseId) {
  const created = run(["d1", "create", DB_NAME], { capture: true });
  databaseId = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(created)?.[1] ?? "";
  if (!databaseId) {
    console.error("\n✖ Could not read the new database id from wrangler's output.");
    console.error(created);
    process.exit(1);
  }
  console.log(`  created ${databaseId}`);
} else {
  console.log(`  reusing ${databaseId}`);
}

// 3. Build, then point the generated config at the real database.
step("Building");
execFileSync("npm", ["run", "build"], { stdio: "inherit", shell: process.platform === "win32" });

step("Wiring the worker config to that database");
const config = JSON.parse(readFileSync(CONFIG, "utf8"));
config.d1_databases = [{ binding: "DB", database_name: DB_NAME, database_id: databaseId }];
writeFileSync(CONFIG, JSON.stringify(config, null, 2));
console.log(`  ${CONFIG} → ${DB_NAME} (${databaseId})`);

// 4. Ship it. Tables are created by the app itself on the first request.
step("Deploying to Cloudflare");
run(["deploy", "-c", CONFIG]);

console.log(`
✔ Deployed.

Next:
  1. Set the owner password on this deployment:
       npx wrangler secret put OWNER_PASSWORD
  2. Attach your domain in the Cloudflare dashboard:
       Workers & Pages → ${config.name} → Settings → Domains & Routes → Add custom domain
     Use a subdomain of a domain you own, then add the matching DNS record at your registrar.

  The database starts empty; the app creates its own tables on the first visit.
`);
