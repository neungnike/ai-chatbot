# University IT Support Chatbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a RAG-based chatbot that answers university IT questions from
internal documents/ticket history only, served via LINE OA, a standalone web
chat page, and a cross-origin embeddable widget.

**Architecture:** A single Express.js/TypeScript "RAG Engine" service exposes
`POST /api/chat`. It embeds the incoming question via the Qwen embedding API,
retrieves top-k chunks from PostgreSQL/pgvector, applies a grounding-score
threshold (skip generation and answer "unknown" if nothing relevant was
found), and otherwise calls the Qwen chat completion API with the retrieved
context to produce a grounded, cited answer. LINE webhook, the standalone web
page, and the embeddable widget are all thin clients that call this one
endpoint. A separate manual Ingestion CLI parses uploaded documents, chunks
them, embeds them, and stores them in pgvector.

**Tech Stack:** Node.js, TypeScript, Express, PostgreSQL + pgvector, Qwen API
(DashScope-compatible REST endpoints for chat completion and text embedding),
Vitest for tests, plain HTML/CSS/JS for the web page and widget (no frontend
framework).

## Task Assignment

- Tasks 1–7 and 10 (backend, ingestion, RAG engine, chat API, LINE webhook,
  integration test): implemented by **Qwen**.
- Tasks 8–9 (standalone web chat page, embeddable widget UI): implemented by
  **Claude**, since they are front-end/UI work.

## Global Constraints

- All source in TypeScript, compiled via `tsc`, Node 20+.
- Database: PostgreSQL with the `pgvector` extension. No other datastore.
- Qwen API calls go through a single client module (`src/qwen/client.ts`) —
  no ad-hoc `fetch`/`curl` calls to Qwen elsewhere in the codebase.
- Grounding rule: if retrieval finds no chunk above the similarity threshold,
  the system MUST reply with the fixed "unknown, contact IT support" message
  and MUST NOT call the Qwen chat completion API for that turn.
- CORS for `/api/chat` and `/widget.js` is allowlist-based, configured via
  `ALLOWED_ORIGINS` env var (comma-separated), not `*`.
- No login/auth on the web page or widget.
- Every chat response that used retrieved context must persist
  `retrieved_chunk_ids` alongside the message row.

---

### Task 1: Project scaffolding + Postgres/pgvector setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `docker-compose.yml`
- Create: `src/config.ts`
- Test: `test/config.test.ts`

**Interfaces:**
- Produces: `config` object from `src/config.ts` exporting
  `{ port: number, databaseUrl: string, qwenApiKey: string, qwenBaseUrl: string, allowedOrigins: string[] }`, read from `process.env` with clear errors if required vars are missing.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "university-it-chatbot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/server.ts",
    "start": "node dist/server.js",
    "ingest": "tsx src/ingest/cli.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "express": "^4.19.2",
    "cors": "^2.8.5",
    "pg": "^8.12.0",
    "pdf-parse": "^1.1.1",
    "mammoth": "^1.8.0",
    "dotenv": "^16.4.5",
    "@line/bot-sdk": "^9.4.1"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "tsx": "^4.16.5",
    "vitest": "^2.0.5",
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/node": "^20.14.15",
    "@types/pg": "^8.11.6"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `.env.example`**

```
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/it_chatbot
QWEN_API_KEY=your-api-key-here
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
ALLOWED_ORIGINS=http://localhost:3000
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules
dist
.env
*.log
```

- [ ] **Step 5: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: it_chatbot
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

- [ ] **Step 6: Write the failing test for config loading**

```typescript
// test/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
    process.env.QWEN_API_KEY = "test-key";
    process.env.QWEN_BASE_URL = "https://example.com/v1";
    process.env.ALLOWED_ORIGINS = "http://a.com,http://b.com";
    process.env.PORT = "4000";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("parses required env vars into a config object", async () => {
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();
    expect(config.port).toBe(4000);
    expect(config.databaseUrl).toBe("postgres://u:p@localhost:5432/db");
    expect(config.qwenApiKey).toBe("test-key");
    expect(config.allowedOrigins).toEqual(["http://a.com", "http://b.com"]);
  });

  it("throws if a required var is missing", async () => {
    delete process.env.QWEN_API_KEY;
    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig()).toThrow(/QWEN_API_KEY/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm install && npx vitest run test/config.test.ts`
Expected: FAIL — `src/config.ts` does not exist yet.

- [ ] **Step 3: Implement `src/config.ts`**

```typescript
// src/config.ts
import "dotenv/config";

export interface AppConfig {
  port: number;
  databaseUrl: string;
  qwenApiKey: string;
  qwenBaseUrl: string;
  allowedOrigins: string[];
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? "3000"),
    databaseUrl: requireEnv("DATABASE_URL"),
    qwenApiKey: requireEnv("QWEN_API_KEY"),
    qwenBaseUrl: requireEnv("QWEN_BASE_URL"),
    allowedOrigins: requireEnv("ALLOWED_ORIGINS")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/config.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Start Postgres and verify pgvector is available**

Run: `docker compose up -d && docker compose exec postgres psql -U postgres -d it_chatbot -c "CREATE EXTENSION IF NOT EXISTS vector; SELECT extname FROM pg_extension WHERE extname='vector';"`
Expected: prints `vector` row.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json .env.example .gitignore docker-compose.yml src/config.ts test/config.test.ts
git commit -m "chore: project scaffolding, config loader, pgvector docker-compose"
```

---

### Task 2: Database schema + migration runner

**Files:**
- Create: `src/db/schema.sql`
- Create: `src/db/pool.ts`
- Create: `src/db/migrate.ts`
- Test: `test/db/migrate.test.ts`

**Interfaces:**
- Consumes: `loadConfig()` from Task 1 (`src/config.ts`).
- Produces: `getPool(): pg.Pool` from `src/db/pool.ts`, and `runMigrations(pool: pg.Pool): Promise<void>` from `src/db/migrate.ts`, used by every later task that touches the DB.

- [ ] **Step 1: Write `src/db/schema.sql`**

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,
  source_name TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding VECTOR(1024) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS chunks_embedding_idx
  ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL CHECK (channel IN ('line', 'web', 'widget')),
  external_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  retrieved_chunk_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Note: `VECTOR(1024)` assumes Qwen's `text-embedding-v3` output dimension of
1024. Task 3 confirms this against the real API and this file is adjusted
there if the actual dimension differs.

- [ ] **Step 2: Implement `src/db/pool.ts`**

```typescript
// src/db/pool.ts
import pg from "pg";
import { loadConfig } from "../config.js";

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    const config = loadConfig();
    pool = new pg.Pool({ connectionString: config.databaseUrl });
  }
  return pool;
}
```

- [ ] **Step 3: Implement `src/db/migrate.ts`**

```typescript
// src/db/migrate.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(pool: pg.Pool): Promise<void> {
  const sql = readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  await pool.query(sql);
}
```

- [ ] **Step 4: Write the failing test**

```typescript
// test/db/migrate.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
```

- [ ] **Step 5: Run test to verify it fails first, then run migrations to verify it passes**

Run: `docker compose up -d` (ensure Postgres running), then
`DATABASE_URL=postgres://postgres:postgres@localhost:5432/it_chatbot npx vitest run test/db/migrate.test.ts`
Expected: PASS after implementation is in place (this test also serves as
the "does the SQL run cleanly" check — if it fails, the SQL has a syntax
error).

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.sql src/db/pool.ts src/db/migrate.ts test/db/migrate.test.ts
git commit -m "feat: postgres+pgvector schema and migration runner"
```

---

### Task 3: Qwen API client (embeddings + chat completion)

**Files:**
- Create: `src/qwen/client.ts`
- Test: `test/qwen/client.test.ts`

**Interfaces:**
- Consumes: `loadConfig()` from Task 1.
- Produces:
  - `embedText(text: string): Promise<number[]>`
  - `embedBatch(texts: string[]): Promise<number[][]>`
  - `chatComplete(params: { system: string; user: string }): Promise<string>`
  All exported from `src/qwen/client.ts`. Later tasks (ingestion, RAG engine) call these only — no direct HTTP calls to Qwen elsewhere.

- [ ] **Step 1: Write the failing test using a mocked `fetch`**

```typescript
// test/qwen/client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("qwen client", () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
    process.env.QWEN_API_KEY = "test-key";
    process.env.QWEN_BASE_URL = "https://example.com/v1";
    process.env.ALLOWED_ORIGINS = "http://a.com";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it("embedText posts to the embeddings endpoint and returns the vector", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    }) as unknown as typeof fetch;

    const { embedText } = await import("../../src/qwen/client.js");
    const result = await embedText("hello");

    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://example.com/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
      })
    );
  });

  it("chatComplete posts to chat completions and returns message content", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "the answer" } }],
      }),
    }) as unknown as typeof fetch;

    const { chatComplete } = await import("../../src/qwen/client.js");
    const result = await chatComplete({ system: "sys", user: "question" });

    expect(result).toBe("the answer");
  });

  it("throws a descriptive error on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "server error",
    }) as unknown as typeof fetch;

    const { embedText } = await import("../../src/qwen/client.js");
    await expect(embedText("hello")).rejects.toThrow(/Qwen embeddings request failed: 500/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/qwen/client.test.ts`
Expected: FAIL — `src/qwen/client.ts` does not exist.

- [ ] **Step 3: Implement `src/qwen/client.ts`**

```typescript
// src/qwen/client.ts
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
      `Qwen ${path.replace("/", "")} request failed: ${response.status} ${text}`
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
```

Fix the error message template so the assertion in Step 1 matches exactly
(`Qwen embeddings request failed: 500 ...`): use the literal path segment
name rather than derived string.

```typescript
// replace the throw line above with:
    throw new Error(`Qwen ${path === "/embeddings" ? "embeddings" : "chat"} request failed: ${response.status} ${text}`);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/qwen/client.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Manually verify the real embedding dimension against a live key**

Run:
```bash
curl -s https://dashscope-intl.aliyuncs.com/compatible-mode/v1/embeddings \
  -H "Authorization: Bearer $QWEN_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"text-embedding-v3","input":["test"]}' | python -c "import json,sys; print(len(json.load(sys.stdin)['data'][0]['embedding']))"
```
If the printed number is not `1024`, update `VECTOR(1024)` in
`src/db/schema.sql` (Task 2) to match, then re-run migrations against a
fresh database.

- [ ] **Step 6: Commit**

```bash
git add src/qwen/client.ts test/qwen/client.test.ts
git commit -m "feat: qwen api client for embeddings and chat completion"
```

---

### Task 4: Chunking + document ingestion CLI

**Files:**
- Create: `src/ingest/chunk.ts`
- Create: `src/ingest/parseFile.ts`
- Create: `src/ingest/cli.ts`
- Test: `test/ingest/chunk.test.ts`
- Test: `test/ingest/parseFile.test.ts`

**Interfaces:**
- Consumes: `embedBatch` from Task 3 (`src/qwen/client.ts`), `getPool` from Task 2 (`src/db/pool.ts`).
- Produces: `chunkText(text: string, opts?: { chunkSize?: number; overlap?: number }): string[]` and `parseFile(filePath: string): Promise<string>`, both reused by the CLI and by tests. `cli.ts` is the `npm run ingest -- <file>` entrypoint; no other module calls it programmatically.

- [ ] **Step 1: Write the failing test for `chunkText`**

```typescript
// test/ingest/chunk.test.ts
import { describe, it, expect } from "vitest";
import { chunkText } from "../../src/ingest/chunk.js";

describe("chunkText", () => {
  it("splits text into chunks no larger than chunkSize characters", () => {
    const text = "word ".repeat(1000).trim();
    const chunks = chunkText(text, { chunkSize: 500, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(500);
    }
  });

  it("includes overlap between consecutive chunks", () => {
    const text = "abcdefghij".repeat(100);
    const chunks = chunkText(text, { chunkSize: 200, overlap: 50 });
    const endOfFirst = chunks[0].slice(-50);
    const startOfSecond = chunks[1].slice(0, 50);
    expect(startOfSecond).toBe(endOfFirst);
  });

  it("returns a single chunk for short text", () => {
    const chunks = chunkText("short text", { chunkSize: 500, overlap: 50 });
    expect(chunks).toEqual(["short text"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ingest/chunk.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/ingest/chunk.ts`**

```typescript
// src/ingest/chunk.ts
export function chunkText(
  text: string,
  opts: { chunkSize?: number; overlap?: number } = {}
): string[] {
  const chunkSize = opts.chunkSize ?? 2000; // ~500 tokens
  const overlap = opts.overlap ?? 200;

  if (text.length <= chunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - overlap;
  }
  return chunks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/ingest/chunk.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing test for `parseFile`**

```typescript
// test/ingest/parseFile.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseFile } from "../../src/ingest/parseFile.js";

describe("parseFile", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "ingest-test-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads plain .txt files as-is", async () => {
    const filePath = path.join(dir, "note.txt");
    writeFileSync(filePath, "wifi ssid is Univ-Staff");
    const content = await parseFile(filePath);
    expect(content).toBe("wifi ssid is Univ-Staff");
  });

  it("reads .csv files as plain text", async () => {
    const filePath = path.join(dir, "tickets.csv");
    writeFileSync(filePath, "question,answer\nvpn down,restart client");
    const content = await parseFile(filePath);
    expect(content).toContain("vpn down,restart client");
  });

  it("throws a clear error for unsupported extensions", async () => {
    const filePath = path.join(dir, "image.png");
    writeFileSync(filePath, "not really a png");
    await expect(parseFile(filePath)).rejects.toThrow(/Unsupported file type: .png/);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run test/ingest/parseFile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `src/ingest/parseFile.ts`**

```typescript
// src/ingest/parseFile.ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

export async function parseFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case ".txt":
    case ".csv":
    case ".md": {
      const buffer = await readFile(filePath);
      return buffer.toString("utf-8");
    }
    case ".pdf": {
      const buffer = await readFile(filePath);
      const result = await pdfParse(buffer);
      return result.text;
    }
    case ".docx": {
      const buffer = await readFile(filePath);
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run test/ingest/parseFile.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 9: Implement `src/ingest/cli.ts`**

```typescript
// src/ingest/cli.ts
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
```

- [ ] **Step 10: Verify end-to-end with a real file against local Postgres**

Run: `echo "Reset your university email password at https://password.example.edu" > /tmp/sample.txt && npm run ingest -- /tmp/sample.txt`
Expected: prints `Ingested 1 chunks from /tmp/sample.txt`; confirm with
`docker compose exec postgres psql -U postgres -d it_chatbot -c "SELECT count(*) FROM chunks;"`.

- [ ] **Step 11: Commit**

```bash
git add src/ingest/chunk.ts src/ingest/parseFile.ts src/ingest/cli.ts test/ingest/chunk.test.ts test/ingest/parseFile.test.ts
git commit -m "feat: chunking, file parsing, and ingestion CLI"
```

---

### Task 5: RAG engine core (retrieval + grounding + answer generation)

**Files:**
- Create: `src/rag/retrieve.ts`
- Create: `src/rag/engine.ts`
- Test: `test/rag/engine.test.ts`

**Interfaces:**
- Consumes: `embedText`, `chatComplete` from Task 3; `getPool` from Task 2.
- Produces: `answerQuestion(params: { question: string; sessionId: string }): Promise<{ answer: string; groundedChunkIds: string[] }>` from `src/rag/engine.ts`, consumed directly by Task 6 (HTTP API) and Task 7 (LINE webhook).

- [ ] **Step 1: Implement `src/rag/retrieve.ts`**

```typescript
// src/rag/retrieve.ts
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
```

- [ ] **Step 2: Write the failing test for `answerQuestion` using a mocked pool and mocked Qwen client**

```typescript
// test/rag/engine.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/qwen/client.js", () => ({
  embedText: vi.fn(async () => [0.1, 0.2, 0.3]),
  chatComplete: vi.fn(async () => "You can reset your password at the portal."),
}));

vi.mock("../../src/db/pool.js", () => ({
  getPool: vi.fn(),
}));

import { getPool } from "../../src/db/pool.js";
import { chatComplete } from "../../src/qwen/client.js";

describe("answerQuestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a grounded answer with cited chunk ids when relevant chunks are found", async () => {
    const mockQuery = vi.fn().mockResolvedValueOnce({
      rows: [
        { id: "chunk-1", content: "Reset password at portal.example.edu", distance: 0.1 },
      ],
    });
    (getPool as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

    const { answerQuestion } = await import("../../src/rag/engine.js");
    const result = await answerQuestion({ question: "how do I reset my password?", sessionId: "s1" });

    expect(result.answer).toBe("You can reset your password at the portal.");
    expect(result.groundedChunkIds).toEqual(["chunk-1"]);
    expect(chatComplete).toHaveBeenCalledTimes(1);
  });

  it("returns the unknown message and skips chatComplete when no chunks pass the threshold", async () => {
    const mockQuery = vi.fn().mockResolvedValueOnce({ rows: [] });
    (getPool as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

    const { answerQuestion } = await import("../../src/rag/engine.js");
    const result = await answerQuestion({ question: "what is the meaning of life?", sessionId: "s1" });

    expect(result.answer).toMatch(/ไม่ทราบ/);
    expect(result.groundedChunkIds).toEqual([]);
    expect(chatComplete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/rag/engine.test.ts`
Expected: FAIL — `src/rag/engine.ts` does not exist.

- [ ] **Step 4: Implement `src/rag/engine.ts`**

```typescript
// src/rag/engine.ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/rag/engine.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/rag/retrieve.ts src/rag/engine.ts test/rag/engine.test.ts
git commit -m "feat: RAG retrieval and grounded answer generation"
```

---

### Task 6: Chat API (`/api/chat`), session persistence, CORS

**Files:**
- Create: `src/chat/sessionStore.ts`
- Create: `src/api/chatRoute.ts`
- Create: `src/server.ts`
- Test: `test/api/chatRoute.test.ts`

**Interfaces:**
- Consumes: `answerQuestion` from Task 5, `getPool` from Task 2, `loadConfig` from Task 1.
- Produces: `createChatRouter(): express.Router` mounted at `/api/chat`; the running server from `src/server.ts` is what Task 7 and Task 8/9 point their clients at (`POST /api/chat` with body `{ message: string, sessionId?: string, channel: "web" | "widget" | "line", externalUserId: string }`, response `{ answer: string, sessionId: string }`).

- [ ] **Step 1: Implement `src/chat/sessionStore.ts`**

```typescript
// src/chat/sessionStore.ts
import type pg from "pg";

export async function getOrCreateSession(
  pool: pg.Pool,
  params: { sessionId?: string; channel: "line" | "web" | "widget"; externalUserId: string }
): Promise<string> {
  if (params.sessionId) {
    const existing = await pool.query(`SELECT id FROM chat_sessions WHERE id = $1`, [
      params.sessionId,
    ]);
    if (existing.rows.length > 0) return existing.rows[0].id;
  }

  const created = await pool.query(
    `INSERT INTO chat_sessions (channel, external_user_id) VALUES ($1, $2) RETURNING id`,
    [params.channel, params.externalUserId]
  );
  return created.rows[0].id;
}

export async function saveMessage(
  pool: pg.Pool,
  params: {
    sessionId: string;
    role: "user" | "assistant";
    content: string;
    retrievedChunkIds: string[];
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO chat_messages (session_id, role, content, retrieved_chunk_ids) VALUES ($1, $2, $3, $4)`,
    [params.sessionId, params.role, params.content, params.retrievedChunkIds]
  );
}
```

- [ ] **Step 2: Write the failing test for the chat route using supertest-style raw http calls**

```typescript
// test/api/chatRoute.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import http from "node:http";

vi.mock("../../src/rag/engine.js", () => ({
  answerQuestion: vi.fn(async () => ({ answer: "reset it here", groundedChunkIds: ["c1"] })),
}));

vi.mock("../../src/db/pool.js", () => ({
  getPool: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [{ id: "session-1" }] }),
  })),
}));

async function withServer(app: express.Express, fn: (base: string) => Promise<void>) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const base = typeof address === "object" && address ? `http://127.0.0.1:${address.port}` : "";
  try {
    await fn(base);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("POST /api/chat", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an answer and a sessionId", async () => {
    const { createChatRouter } = await import("../../src/api/chatRoute.js");
    const app = express();
    app.use(express.json());
    app.use("/api/chat", createChatRouter());

    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "wifi ไม่ติด", channel: "web", externalUserId: "anon-1" }),
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.answer).toBe("reset it here");
      expect(body.sessionId).toBe("session-1");
    });
  });

  it("returns 400 when message is missing", async () => {
    const { createChatRouter } = await import("../../src/api/chatRoute.js");
    const app = express();
    app.use(express.json());
    app.use("/api/chat", createChatRouter());

    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "web", externalUserId: "anon-1" }),
      });
      expect(res.status).toBe(400);
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/api/chatRoute.test.ts`
Expected: FAIL — `src/api/chatRoute.ts` does not exist.

- [ ] **Step 4: Implement `src/api/chatRoute.ts`**

```typescript
// src/api/chatRoute.ts
import { Router } from "express";
import { getPool } from "../db/pool.js";
import { answerQuestion } from "../rag/engine.js";
import { getOrCreateSession, saveMessage } from "../chat/sessionStore.js";

export function createChatRouter(): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const { message, sessionId, channel, externalUserId } = req.body ?? {};

    if (typeof message !== "string" || message.trim() === "") {
      res.status(400).json({ error: "message is required" });
      return;
    }
    if (!["line", "web", "widget"].includes(channel)) {
      res.status(400).json({ error: "channel must be one of line, web, widget" });
      return;
    }
    if (typeof externalUserId !== "string" || externalUserId.trim() === "") {
      res.status(400).json({ error: "externalUserId is required" });
      return;
    }

    const pool = getPool();
    const resolvedSessionId = await getOrCreateSession(pool, { sessionId, channel, externalUserId });

    await saveMessage(pool, {
      sessionId: resolvedSessionId,
      role: "user",
      content: message,
      retrievedChunkIds: [],
    });

    const { answer, groundedChunkIds } = await answerQuestion({
      question: message,
      sessionId: resolvedSessionId,
    });

    await saveMessage(pool, {
      sessionId: resolvedSessionId,
      role: "assistant",
      content: answer,
      retrievedChunkIds: groundedChunkIds,
    });

    res.json({ answer, sessionId: resolvedSessionId });
  });

  return router;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/api/chatRoute.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Implement `src/server.ts`**

```typescript
// src/server.ts
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { getPool } from "./db/pool.js";
import { runMigrations } from "./db/migrate.js";
import { createChatRouter } from "./api/chatRoute.js";
import { createLineWebhookRouter } from "./line/webhook.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || config.allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin not allowed: ${origin}`));
      }
    },
  })
);

app.use("/line/webhook", createLineWebhookRouter());

app.use(express.json());
app.use("/api/chat", createChatRouter());
app.use(express.static(path.join(__dirname, "../public")));

async function main(): Promise<void> {
  await runMigrations(getPool());
  app.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Note: `src/line/webhook.ts` is created in Task 7; this file references it in
advance because the router wiring belongs in `server.ts`. Task 7 must create
that exact file/export for `server.ts` to compile.

- [ ] **Step 7: Commit**

```bash
git add src/chat/sessionStore.ts src/api/chatRoute.ts src/server.ts test/api/chatRoute.test.ts
git commit -m "feat: chat API endpoint with session persistence and CORS allowlist"
```

---

### Task 7: LINE OA webhook integration

**Files:**
- Create: `src/line/webhook.ts`
- Test: `test/line/webhook.test.ts`

**Interfaces:**
- Consumes: `answerQuestion` from Task 5; LINE channel secret/token from `loadConfig` (extend `AppConfig`/`.env.example` with `lineChannelAccessToken`, `lineChannelSecret`).
- Produces: `createLineWebhookRouter(): express.Router`, mounted by `src/server.ts` (Task 6) at `/line/webhook` **before** `express.json()` is applied, because the LINE SDK middleware needs the raw body for signature verification.

- [ ] **Step 1: Extend `src/config.ts` with LINE vars**

```typescript
// src/config.ts — add to AppConfig interface and loadConfig()
export interface AppConfig {
  port: number;
  databaseUrl: string;
  qwenApiKey: string;
  qwenBaseUrl: string;
  allowedOrigins: string[];
  lineChannelAccessToken: string;
  lineChannelSecret: string;
}
```

```typescript
// inside loadConfig(), add:
    lineChannelAccessToken: requireEnv("LINE_CHANNEL_ACCESS_TOKEN"),
    lineChannelSecret: requireEnv("LINE_CHANNEL_SECRET"),
```

Update the two existing tests in `test/config.test.ts` (Task 1) to also set
`process.env.LINE_CHANNEL_ACCESS_TOKEN` and `process.env.LINE_CHANNEL_SECRET`
in `beforeEach`, otherwise they will now fail.

- [ ] **Step 2: Write the failing test for the webhook handler logic**

```typescript
// test/line/webhook.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/rag/engine.js", () => ({
  answerQuestion: vi.fn(async () => ({ answer: "ลองรีสตาร์ทเราเตอร์ครับ", groundedChunkIds: ["c1"] })),
}));

const replyMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@line/bot-sdk", () => ({
  messagingApi: {
    MessagingApiClient: vi.fn().mockImplementation(() => ({ replyMessage: replyMock })),
  },
  middleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { handleLineEvent } from "../../src/line/webhook.js";
import { answerQuestion } from "../../src/rag/engine.js";

describe("handleLineEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ignores non-text-message events", async () => {
    await handleLineEvent({ type: "follow", replyToken: "t1", source: { userId: "u1" } } as never);
    expect(answerQuestion).not.toHaveBeenCalled();
  });

  it("answers text messages and replies via the LINE client", async () => {
    await handleLineEvent({
      type: "message",
      replyToken: "t1",
      source: { userId: "u1" },
      message: { type: "text", text: "wifi ไม่ติด" },
    } as never);

    expect(answerQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ question: "wifi ไม่ติด" })
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/line/webhook.test.ts`
Expected: FAIL — `src/line/webhook.ts` does not exist.

- [ ] **Step 4: Implement `src/line/webhook.ts`**

```typescript
// src/line/webhook.ts
import { Router } from "express";
import { messagingApi, middleware, type WebhookEvent } from "@line/bot-sdk";
import { loadConfig } from "../config.js";
import { answerQuestion } from "../rag/engine.js";
import { getPool } from "../db/pool.js";
import { getOrCreateSession, saveMessage } from "../chat/sessionStore.js";

function getClient() {
  const config = loadConfig();
  return new messagingApi.MessagingApiClient({ channelAccessToken: config.lineChannelAccessToken });
}

export async function handleLineEvent(event: WebhookEvent): Promise<void> {
  if (event.type !== "message" || event.message.type !== "text") {
    return;
  }

  const userId = event.source.userId ?? "unknown";
  const pool = getPool();
  const sessionId = await getOrCreateSession(pool, {
    channel: "line",
    externalUserId: userId,
  });

  await saveMessage(pool, {
    sessionId,
    role: "user",
    content: event.message.text,
    retrievedChunkIds: [],
  });

  const { answer, groundedChunkIds } = await answerQuestion({
    question: event.message.text,
    sessionId,
  });

  await saveMessage(pool, {
    sessionId,
    role: "assistant",
    content: answer,
    retrievedChunkIds: groundedChunkIds,
  });

  const client = getClient();
  await client.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: "text", text: answer }],
  });
}

export function createLineWebhookRouter(): Router {
  const router = Router();
  const config = loadConfig();

  router.post(
    "/",
    middleware({ channelSecret: config.lineChannelSecret }),
    async (req, res) => {
      const events: WebhookEvent[] = req.body.events ?? [];
      await Promise.all(events.map(handleLineEvent));
      res.status(200).end();
    }
  );

  return router;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/line/webhook.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Update `.env.example`** (already has the two LINE vars from Task 1; confirm no change needed)

- [ ] **Step 7: Commit**

```bash
git add src/config.ts src/line/webhook.ts test/config.test.ts test/line/webhook.test.ts
git commit -m "feat: LINE OA webhook integration"
```

---

### Task 8: Standalone web chat page (Claude)

**Files:**
- Create: `public/index.html`
- Create: `public/chat.js`
- Create: `public/style.css`

**Interfaces:**
- Consumes: `POST /api/chat` from Task 6 (same-origin, so no CORS config needed for this page itself).
- Produces: a static page served by `express.static` (already wired in Task 6's `src/server.ts`) at `/`.

- [ ] **Step 1: Create `public/index.html`**

```html
<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <title>IT Support Chat</title>
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <main id="chat-root">
      <h1>ผู้ช่วย IT มหาวิทยาลัย</h1>
      <div id="messages"></div>
      <form id="chat-form">
        <input id="chat-input" type="text" placeholder="พิมพ์คำถามของคุณ..." autocomplete="off" />
        <button type="submit">ส่ง</button>
      </form>
    </main>
    <script src="/chat.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `public/style.css`**

```css
body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
#messages { display: flex; flex-direction: column; gap: 0.5rem; min-height: 300px; margin-bottom: 1rem; }
.msg { padding: 0.5rem 0.75rem; border-radius: 8px; max-width: 80%; }
.msg.user { align-self: flex-end; background: #2563eb; color: white; }
.msg.assistant { align-self: flex-start; background: #f1f5f9; color: #111; }
#chat-form { display: flex; gap: 0.5rem; }
#chat-input { flex: 1; padding: 0.5rem; }
```

- [ ] **Step 3: Create `public/chat.js`**

```javascript
// public/chat.js
(function () {
  const messagesEl = document.getElementById("messages");
  const formEl = document.getElementById("chat-form");
  const inputEl = document.getElementById("chat-input");

  const storageKey = "it-chatbot-session-id";
  let sessionId = localStorage.getItem(storageKey) || undefined;

  function appendMessage(role, text) {
    const el = document.createElement("div");
    el.className = `msg ${role}`;
    el.textContent = text;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function sendMessage(message) {
    appendMessage("user", message);

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        sessionId,
        channel: "web",
        externalUserId: getOrCreateAnonId(),
      }),
    });

    if (!response.ok) {
      appendMessage("assistant", "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      return;
    }

    const data = await response.json();
    sessionId = data.sessionId;
    localStorage.setItem(storageKey, sessionId);
    appendMessage("assistant", data.answer);
  }

  function getOrCreateAnonId() {
    const key = "it-chatbot-anon-id";
    let id = localStorage.getItem(key);
    if (!id) {
      id = `anon-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(key, id);
    }
    return id;
  }

  formEl.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = inputEl.value.trim();
    if (!message) return;
    inputEl.value = "";
    sendMessage(message);
  });
})();
```

- [ ] **Step 4: Manually verify in a browser**

Run: `npm run build && npm start` then open `http://localhost:3000/`, type
"wifi ไม่ติด", confirm a response appears and `sessionId` persists in
localStorage across a page reload (second message should reuse the same
session).

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/style.css public/chat.js
git commit -m "feat: standalone web chat page"
```

---

### Task 9: Cross-origin embeddable widget (Claude)

**Files:**
- Create: `public/widget.js`
- Create: `public/widget-frame.html`

**Interfaces:**
- Consumes: `POST /api/chat` from Task 6, called cross-origin from whatever third-party site embeds the script — requires that site's origin to be present in `ALLOWED_ORIGINS` (Task 1/6 config).
- Produces: a single `<script src="https://<host>/widget.js" data-chatbot></script>` snippet that external sites paste in; no other files depend on this one.

- [ ] **Step 1: Create `public/widget-frame.html`** (loaded inside the iframe; reuses the same chat UI/logic as the standalone page but styled for a small bubble)

```html
<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="/style.css" />
    <style>
      body { margin: 0; max-width: none; }
      #chat-root { margin: 0.5rem; }
      h1 { display: none; }
    </style>
  </head>
  <body>
    <main id="chat-root">
      <div id="messages"></div>
      <form id="chat-form">
        <input id="chat-input" type="text" placeholder="พิมพ์คำถามของคุณ..." autocomplete="off" />
        <button type="submit">ส่ง</button>
      </form>
    </main>
    <script src="/chat.js"></script>
  </body>
</html>
```

Update `public/chat.js` from Task 8 to send `channel: "widget"` when running
inside the iframe. Simplest approach: read a `data-channel` value the parent
sets, defaulting to `"web"`.

```javascript
// public/chat.js — replace the hardcoded channel line inside sendMessage()
        channel: window.__CHATBOT_CHANNEL__ || "web",
```

```html
<!-- public/widget-frame.html — add before the chat.js script tag -->
    <script>window.__CHATBOT_CHANNEL__ = "widget";</script>
```

- [ ] **Step 2: Create `public/widget.js`**

```javascript
// public/widget.js
(function () {
  const currentScript = document.currentScript;
  const origin = new URL(currentScript.src).origin;

  const bubble = document.createElement("button");
  bubble.textContent = "IT Help";
  Object.assign(bubble.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: "999999",
    borderRadius: "999px",
    padding: "12px 20px",
    background: "#2563eb",
    color: "white",
    border: "none",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
  });

  const iframe = document.createElement("iframe");
  iframe.src = `${origin}/widget-frame.html`;
  Object.assign(iframe.style, {
    position: "fixed",
    bottom: "80px",
    right: "20px",
    width: "360px",
    height: "480px",
    border: "none",
    borderRadius: "12px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
    zIndex: "999999",
    display: "none",
  });

  bubble.addEventListener("click", () => {
    iframe.style.display = iframe.style.display === "none" ? "block" : "none";
  });

  document.body.appendChild(iframe);
  document.body.appendChild(bubble);
})();
```

- [ ] **Step 3: Manually verify cross-origin embedding**

Run: with the server started (`npm start`, listening on `http://localhost:3000`),
set `ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5500` in `.env`,
restart the server, then serve a throwaway `test.html` containing
`<script src="http://localhost:3000/widget.js"></script>` from a second
static server on port 5500 (e.g. `npx serve -l 5500`). Open
`http://localhost:5500/test.html`, click the bubble, send a message, and
confirm a response renders with no CORS error in the browser console.

- [ ] **Step 4: Commit**

```bash
git add public/widget.js public/widget-frame.html public/chat.js
git commit -m "feat: cross-origin embeddable chat widget"
```

---

### Task 10: End-to-end integration test

**Files:**
- Create: `test/integration/e2e.test.ts`

**Interfaces:**
- Consumes: real Postgres (via Task 2's `runMigrations`), real ingestion (`chunkText`/`parseFile` from Task 4), the real `createChatRouter` from Task 6 — but a mocked Qwen client so the test doesn't require a live API key.

- [ ] **Step 1: Write the integration test**

```typescript
// test/integration/e2e.test.ts
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import http from "node:http";
import pg from "pg";

vi.mock("../../src/qwen/client.js", () => ({
  embedText: vi.fn(async (text: string) => (text.includes("wifi") ? [1, 0, 0] : [0, 1, 0])),
  embedBatch: vi.fn(async (texts: string[]) => texts.map(() => [1, 0, 0])),
  chatComplete: vi.fn(async () => "ลองรีสตาร์ท router แล้วเชื่อมต่อใหม่"),
}));

const connectionString =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/it_chatbot";

describe("end-to-end: ingest then ask", () => {
  const pool = new pg.Pool({ connectionString });

  beforeAll(async () => {
    const { runMigrations } = await import("../../src/db/migrate.js");
    await runMigrations(pool);
    await pool.query("TRUNCATE chunks, documents, chat_messages, chat_sessions CASCADE");

    const docResult = await pool.query(
      `INSERT INTO documents (source_type, source_name) VALUES ('txt', 'wifi.txt') RETURNING id`
    );
    await pool.query(
      `INSERT INTO chunks (document_id, content, embedding) VALUES ($1, $2, $3)`,
      [docResult.rows[0].id, "หากเชื่อมต่อ wifi ไม่ได้ ให้ลืมเครือข่ายแล้วเชื่อมต่อใหม่", "[1,0,0]"]
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it("answers a question grounded in the ingested chunk", async () => {
    vi.doMock("../../src/db/pool.js", () => ({ getPool: () => pool }));
    const { createChatRouter } = await import("../../src/api/chatRoute.js");

    const app = express();
    app.use(express.json());
    app.use("/api/chat", createChatRouter());

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    const base = typeof address === "object" && address ? `http://127.0.0.1:${address.port}` : "";

    try {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "wifi ไม่ติด", channel: "web", externalUserId: "e2e-user" }),
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.answer).toContain("router");

      const messages = await pool.query(
        `SELECT retrieved_chunk_ids FROM chat_messages WHERE role = 'assistant' ORDER BY created_at DESC LIMIT 1`
      );
      expect(messages.rows[0].retrieved_chunk_ids.length).toBe(1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
```

- [ ] **Step 2: Run against local Postgres**

Run: `docker compose up -d && npx vitest run test/integration/e2e.test.ts`
Expected: PASS. This confirms the citation requirement end-to-end: the
chunk inserted during setup is the one recorded in `retrieved_chunk_ids`.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all tests across every task PASS.

- [ ] **Step 4: Commit**

```bash
git add test/integration/e2e.test.ts
git commit -m "test: end-to-end ingest-then-answer integration test"
```

---

## Post-plan follow-ups (not part of this plan)

- Investigate the university's actual helpdesk/wiki system (spec's Open
  Questions) and extend `parseFile`/ingestion if export formats differ from
  txt/csv/pdf/docx.
- Once the real Qwen embedding dimension is confirmed (Task 3, Step 5), keep
  `src/db/schema.sql`'s `VECTOR(n)` in sync if it ever changes.
