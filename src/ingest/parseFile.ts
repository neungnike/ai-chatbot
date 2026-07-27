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
