import { loadConfig } from "../config.js";

const EMBEDDING_MODEL = "text-embedding-v3";
const CHAT_MODEL = "qwen-plus";

async function post<T>(path: string, body: unknown): Promise<T> {
  const config = loadConfig();
  const response = await fetch(`${config.qwenBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.qwenApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Qwen ${path === "/embeddings" ? "embeddings" : "chat"} request failed: ${response.status} ${text}`
    );
  }

  return response.json() as Promise<T>;
}

interface EmbeddingResponse {
  data: { embedding: number[] }[];
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const result = await post<EmbeddingResponse>("/embeddings", {
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return result.data.map((d) => d.embedding);
}

export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedBatch([text]);
  return vector;
}

interface ChatResponse {
  choices: { message: { content: string } }[];
}

export async function chatComplete(params: {
  system: string;
  user: string;
}): Promise<string> {
  const result = await post<ChatResponse>("/chat/completions", {
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
  });
  return result.choices[0].message.content;
}
