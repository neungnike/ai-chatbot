import type pg from "pg";

export interface RetrievedChunk {
  id: string;
  content: string;
  distance: number;
}

const SIMILARITY_DISTANCE_THRESHOLD = 0.35; // cosine distance; lower = closer
const TOP_K = 5;

export async function retrieveRelevantChunks(
  pool: pg.Pool,
  queryEmbedding: number[]
): Promise<RetrievedChunk[]> {
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;
  const result = await pool.query(
    `SELECT id, content, embedding <=> $1 AS distance
     FROM chunks
     ORDER BY embedding <=> $1
     LIMIT $2`,
    [vectorLiteral, TOP_K]
  );

  return result.rows
    .map((row) => ({ id: row.id, content: row.content, distance: Number(row.distance) }))
    .filter((row) => row.distance <= SIMILARITY_DISTANCE_THRESHOLD);
}
