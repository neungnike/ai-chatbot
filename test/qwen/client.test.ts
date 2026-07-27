import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("qwen client", () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
    process.env.QWEN_API_KEY = "test-key";
    process.env.QWEN_BASE_URL = "https://example.com/v1";
    process.env.ALLOWED_ORIGINS = "http://a.com";
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    process.env.LINE_CHANNEL_SECRET = "line-secret";
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
