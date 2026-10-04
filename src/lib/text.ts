/**
 * A short excerpt of what a visitor wrote, cut at a word boundary near `max` characters, in its original
 * language. Never translated or reworded; only shortened, with an ellipsis when cut.
 */
export function excerpt(text: string, max = 60): string {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max + 1)
  const space = cut.lastIndexOf(' ')
  // A single very long word is cut where it is.
  const end = space > max / 2 ? space : max
  return `${clean.slice(0, end).replace(/[\s,;:.!?]+$/u, '')}…`
}

/** The first line of a message, for a one-line row. The row's CSS ellipsis handles the width. */
export const firstLine = (text: string): string => text.trim().split(/\r?\n/)[0]
