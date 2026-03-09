/**
 * Shared line-processing utilities used by task output tracker and file log loader.
 */

/**
 * Process a data chunk with line buffering, calling onLine for each complete line.
 * Returns the remaining incomplete line (to be buffered for the next chunk).
 */
export function processChunk(
  data: string,
  lineBuffer: string,
  onLine: (line: string) => void
): string {
  const combined = lineBuffer + data;
  const lines = combined.split('\n');

  // The last element is either an incomplete line or empty string
  const remaining = lines.pop() ?? '';

  for (const line of lines) {
    // Strip trailing \r for Windows-style line endings
    const cleaned = line.replace(/\r$/, '');
    if (cleaned.trim()) {
      onLine(cleaned);
    }
  }

  return remaining;
}

/**
 * Normalize line endings for terminal display: convert all line endings to \r\n
 */
export function normalizeLineEndings(data: string): string {
  return data.replace(/\r\n|\r|\n/g, '\r\n');
}
