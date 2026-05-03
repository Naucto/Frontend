export const COMMENT_MAX_LENGTH = 500;
export const COMMENT_MAX_NEWLINES = 10;
export const COMMENT_MAX_CONSECUTIVE_NEWLINES = 2;

export function normalizeCommentValue(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

export function sanitizeCommentValue(value: string): string {
  const normalized = normalizeCommentValue(value);
  let nextValue = "";
  let totalNewlines = 0;
  let consecutiveNewlines = 0;

  for (const char of normalized) {
    if (nextValue.length >= COMMENT_MAX_LENGTH) {
      break;
    }

    if (char === "\n") {
      if (totalNewlines >= COMMENT_MAX_NEWLINES) {
        continue;
      }
      if (consecutiveNewlines >= COMMENT_MAX_CONSECUTIVE_NEWLINES) {
        continue;
      }

      totalNewlines += 1;
      consecutiveNewlines += 1;
      nextValue += char;
      continue;
    }

    consecutiveNewlines = 0;
    nextValue += char;
  }

  return nextValue;
}

export function countCommentNewlines(value: string): number {
  return normalizeCommentValue(value).split("\n").length - 1;
}
