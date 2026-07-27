import { describe, it, expect, afterAll } from "vitest";
import pg from "pg";
import { runMigrations } from "../../src/db/migrate.js";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/it_chatbot";

describe("runMigrations", () => {
  const pool = new pg.Pool({ connectionString });

  afterAll(async () => {
    await pool.end();
  });

  it("creates all expected tables", async () => {
    await runMigrations(pool);
    const result = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const tableNames = result.rows.map((r) => r.table_name);
    expect(tableNames).toEqual(
      expect.arrayContaining(["documents", "chunks", "chat_sessions", "chat_messages"])
    );
  });
});
