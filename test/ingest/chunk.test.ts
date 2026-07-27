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
