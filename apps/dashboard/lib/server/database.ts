import "server-only";

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { Pool } from "pg";
import * as schema from "@/db/schema";

declare global {
  var __mediaCommandPool: Pool | undefined;
  var __mediaCommandPglite: PGlite | undefined;
}

function postgresUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is not configured.");
  return value;
}

function processIsAlive(processId: number) {
  if (!Number.isInteger(processId) || processId <= 0) return false;
  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
}

function prepareLocalPglite(dataDir: string) {
  const absoluteDir = resolve(dataDir);
  const ownerFile = resolve(absoluteDir, ".runtime-owner");
  const postgresPidFile = resolve(absoluteDir, "postmaster.pid");
  mkdirSync(absoluteDir, { recursive: true });

  let recordedOwner = 0;
  if (existsSync(ownerFile)) recordedOwner = Number(readFileSync(ownerFile, "utf8").trim());
  if (recordedOwner && recordedOwner !== process.pid && processIsAlive(recordedOwner)) {
    throw new Error(`PGlite is already in use by process ${recordedOwner}.`);
  }

  if (existsSync(postgresPidFile) && !recordedOwner) {
    throw new Error("PGlite has an unmanaged lock. Stop other database commands before recovery.");
  }
  if (existsSync(postgresPidFile)) unlinkSync(postgresPidFile);
  writeFileSync(ownerFile, String(process.pid), { encoding: "utf8", flag: "w" });

  return absoluteDir;
}

function createDatabase() {
  if (process.env.DATABASE_DRIVER === "pglite") {
    const dataDir = process.env.PGLITE_DATA_DIR;
    if (!dataDir) throw new Error("PGLITE_DATA_DIR is not configured.");
    const client = globalThis.__mediaCommandPglite ?? new PGlite(prepareLocalPglite(dataDir));
    if (process.env.NODE_ENV !== "production") globalThis.__mediaCommandPglite = client;
    return drizzlePglite({ client, schema });
  }

  const pool = globalThis.__mediaCommandPool ?? new Pool({
    connectionString: postgresUrl(),
    max: process.env.NODE_ENV === "production" ? 20 : 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  if (process.env.NODE_ENV !== "production") globalThis.__mediaCommandPool = pool;
  return drizzle({ client: pool, schema });
}

type Database = ReturnType<typeof createDatabase>;
let database: Database | undefined;

function databaseInstance() {
  database ??= createDatabase();
  return database;
}

// Route modules are evaluated by several workers during `next build`. Deferring
// client creation prevents those workers from opening the same local PGlite
// directory when no query is actually being executed.
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const target = databaseInstance();
    const value = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  },
});
