import "server-only";

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

function createDatabase() {
  if (process.env.DATABASE_DRIVER === "pglite") {
    const dataDir = process.env.PGLITE_DATA_DIR;
    if (!dataDir) throw new Error("PGLITE_DATA_DIR is not configured.");
    const client = globalThis.__mediaCommandPglite ?? new PGlite(dataDir);
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

export const db = createDatabase();
