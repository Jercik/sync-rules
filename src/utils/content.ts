/**
 * Write action for file system operations
 */
export type WriteAction = {
  readonly path: string;
  readonly content: string;
};

/**
 * Normalizes text for comparison by handling line ending differences
 * and trimming trailing (not leading) whitespace that can vary across editors.
 * Preserves leading spaces which can be semantically significant (e.g., code blocks).
 */
export function normalizeContent(text: string): string {
  // 1. Normalize line endings to LF
  const normalized = text.replace(/\r\n?/g, "\n");

  // 2. Remove trailing whitespace per line; keep leading whitespace intact
  const processedContent = normalized
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");

  // 3. Remove leading/trailing empty lines from the entire block
  return processedContent.trim();
}
