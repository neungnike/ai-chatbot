import { getPool } from "../db/pool.js";
import { embedText, chatComplete } from "../qwen/client.js";
import { retrieveRelevantChunks } from "./retrieve.js";

const UNKNOWN_ANSWER =
  "ขออภัย ไม่พบข้อมูลที่เกี่ยวข้องในระบบ กรุณาติดต่อ IT support เพื่อขอความช่วยเหลือเพิ่มเติม";

const SYSTEM_PROMPT =
  "You are a university IT support assistant. Answer ONLY using the provided context. " +
  "If the context does not contain the answer, say you don't know. Answer in Thai unless the question is in English.";

export interface AnswerResult {
  answer: string;
  groundedChunkIds: string[];
}

export async function answerQuestion(params: {
  question: string;
  sessionId: string;
}): Promise<AnswerResult> {
  const pool = getPool();
  const queryEmbedding = await embedText(params.question);
  const chunks = await retrieveRelevantChunks(pool, queryEmbedding);

  if (chunks.length === 0) {
    return { answer: UNKNOWN_ANSWER, groundedChunkIds: [] };
  }

  const context = chunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n");
  const userPrompt = `Context:\n${context}\n\nQuestion: ${params.question}`;

  const answer = await chatComplete({ system: SYSTEM_PROMPT, user: userPrompt });

  return { answer, groundedChunkIds: chunks.map((c) => c.id) };
}
