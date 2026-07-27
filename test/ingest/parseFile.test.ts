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
