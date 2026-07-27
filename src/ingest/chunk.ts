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
