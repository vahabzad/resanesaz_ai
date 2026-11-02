import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

const usePglite = process.env.DATABASE_DRIVER === "pglite";
if (usePglite && !process.env.PGLITE_DATA_DIR) throw new Error("PGLITE_DATA_DIR is not configured.");
if (!usePglite && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");

export default defineConfig(usePglite ? {
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  driver: "pglite",
  dbCredentials: { url: process.env.PGLITE_DATA_DIR! },
  strict: true,
  verbose: true,
} : {
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
