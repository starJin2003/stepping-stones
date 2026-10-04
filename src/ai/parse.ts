export interface ParsedStories {
  incoming_story_text: string
  outgoing_story_text: string
  format_ok: boolean
}

// "1)" "1." "1:" "(1)" with any spaces around the digit. Not part of a longer number ("11)", "1.5", "1:30").
const marker = (n: 1 | 2) => new RegExp(String.raw`(?<![\p{L}\p{N}])\(?\s*${n}\s*[).:](?!\d)`, 'u')

/**
 * Splits a tourist's SMS into what they heard (answer 1) and what they would tell a friend (answer 2).
 * Without both markers, the whole text is the incoming story, outgoing is empty and format_ok is false,
 * so the record lands in review instead of being guessed at.
 */
export function parse(raw: string): ParsedStories {
  const text = raw.trim()
  const first = marker(1).exec(text)
  if (first) {
    const afterFirst = first.index + first[0].length
    const second = marker(2).exec(text.slice(afterFirst))
    if (second) {
      return {
        incoming_story_text: text.slice(afterFirst, afterFirst + second.index).trim(),
        outgoing_story_text: text.slice(afterFirst + second.index + second[0].length).trim(),
        format_ok: true,
      }
    }
  }
  return { incoming_story_text: text, outgoing_story_text: '', format_ok: false }
}
