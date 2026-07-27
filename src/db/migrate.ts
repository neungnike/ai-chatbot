import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(pool: pg.Pool): Promise<void> {
  const sql = readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  await pool.query(sql);
}
