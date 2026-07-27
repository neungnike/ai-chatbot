import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
    process.env.QWEN_API_KEY = "test-key";
    process.env.QWEN_BASE_URL = "https://example.com/v1";
    process.env.ALLOWED_ORIGINS = "http://a.com,http://b.com";
    process.env.PORT = "4000";
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    process.env.LINE_CHANNEL_SECRET = "line-secret";
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
