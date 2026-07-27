import path from "node:path";
import { getPool } from "../db/pool.js";
import { runMigrations } from "../db/migrate.js";
import { parseFile } from "./parseFile.js";
import { chunkText } from "./chunk.js";
import { embedBatch } from "../qwen/client.js";

async function ingest(filePath: string): Promise<void> {
  const pool = getPool();
  await runMigrations(pool);

  let text: string;
  try {
    text = await parseFile(filePath);
  } catch (err) {
    console.error(`Failed to parse ${filePath}:`, (err as Error).message);
    return;
  }

  const chunks = chunkText(text);
  const embeddings = await embedBatch(chunks);

  const docResult = await pool.query(
    `INSERT INTO documents (source_type, source_name) VALUES ($1, $2) RETURNING id`,
    [path.extname(filePath).replace(".", ""), path.basename(filePath)]
  );
  const documentId = docResult.rows[0].id;

  for (let i = 0; i < chunks.length; i++) {
    await pool.query(
      `INSERT INTO chunks (document_id, content, embedding, metadata) VALUES ($1, $2, $3, $4)`,
      [documentId, chunks[i], `[${embeddings[i].join(",")}]`, JSON.stringify({ chunkIndex: i })]
    );
  }

  console.log(`Ingested ${chunks.length} chunks from ${filePath}`);
}

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("Usage: npm run ingest -- <file1> [file2 ...]");
    process.exit(1);
  }

  for (const file of files) {
    await ingest(file);
  }

  const pool = getPool();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
