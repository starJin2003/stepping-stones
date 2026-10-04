/** The first line of a message, for a one-line row. The row's CSS ellipsis handles the width. */
export const firstLine = (text: string): string => text.trim().split(/\r?\n/)[0]
