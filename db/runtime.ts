import { env } from "cloudflare:workers";

export function getD1(): D1Database {
  if (!env.DB) throw new Error("Factory database binding is unavailable.");
  return env.DB;
}

// The password the owner account is created with on a brand new database. Set the
// OWNER_PASSWORD secret before first run in any deployment that is reachable from
// the internet — the fallback below is public in this repository and is only meant
// to get local development started.
export function ownerBootstrapPassword(): string {
  const configured = (env as unknown as Record<string, unknown>).OWNER_PASSWORD;
  if (typeof configured === "string" && configured.trim().length >= 8) return configured.trim();
  return "Admin&8687";
}
