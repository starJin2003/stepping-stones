import type { ReferralRules, WordLists } from './config.ts'

// Heard from, by rule first. The heard story is split at the first reporting verb ("told", "erzählt", "dit",
// "alituambia"): the source span before it says who told them, the content span after it says what they heard.
// Fixed word lists then name the source; the model is only asked when no rule fires.

export type RuleCategory = 'guesthouse_guest' | 'guesthouse_staff' | 'local_guide' | 'friend_family' | 'social_online'

export interface RuleResult {
  /** A referral source, or unclear when words for two different sources match. */
  category: RuleCategory | 'unclear'
  /** Which rule fired, e.g. "lodging+guest", or "conflict:guide+online". Kept on the record. */
  rule: string
}

export interface HeardSpans {
  /** Who told them: the heard story up to the first reporting verb. */
  source: string
  /** What they heard: the heard story after that verb. */
  content: string
  /** The reporting verb as written, or null when none was found (then both spans are the whole text). */
  verb: string | null
}

/**
 * Lowercase, accents removed, apostrophes as spaces, one UTF-16 unit for one, so a match position in the
 * plain text is the same position in the NFC text the visitor wrote.
 */
function plainSameLength(text: string): string {
  let out = ''
  for (const ch of text) {
    const plain = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    const kept = plain.length === ch.length ? plain : ch.toLowerCase().length === ch.length ? ch.toLowerCase() : ch
    out += /['’`]/u.test(kept) ? ' ' : kept
  }
  return out
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** "erzähl*" matches any ending, "*blog" any beginning; spaces in a phrase match any spacing. */
function patternSource(pattern: string): string {
  const plain = plainSameLength(pattern.normalize('NFC')).trim()
  const core = plain.replace(/^\*|\*$/g, '')
  const words = core.split(/\s+/).map(escapeRegex).join('\\s+')
  return `${plain.startsWith('*') ? '\\p{L}*' : ''}${words}${plain.endsWith('*') ? '\\p{L}*' : ''}`
}

/** One regex for a word list in every language, longest phrases first, whole words only. */
function wordsRegex(lists: WordLists, flags = 'u'): RegExp {
  const patterns = Object.values(lists)
    .flat()
    .sort((a, b) => b.length - a.length)
    .map(patternSource)
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${patterns.join('|')})(?![\\p{L}\\p{N}])`, flags)
}

interface CompiledRules {
  verb: RegExp
  lodging: RegExp
  lodgingAll: RegExp
  fellowGuest: RegExp
  staff: RegExp
  guide: RegExp
  friendFamily: RegExp
  online: RegExp
}

const compiled = new WeakMap<ReferralRules, CompiledRules>()

function compile(rules: ReferralRules): CompiledRules {
  let c = compiled.get(rules)
  if (!c) {
    c = {
      verb: wordsRegex(rules.reporting_verbs),
      lodging: wordsRegex(rules.lodging),
      lodgingAll: wordsRegex(rules.lodging, 'gu'),
      fellowGuest: wordsRegex(rules.fellow_guest),
      staff: wordsRegex(rules.staff),
      guide: wordsRegex(rules.guide),
      friendFamily: wordsRegex(rules.friend_family),
      online: wordsRegex(rules.online),
    }
    compiled.set(rules, c)
  }
  return c
}

/** Splits a heard story at its first reporting verb. Without one, both spans are the whole text. */
export function splitHeard(text: string, rules: ReferralRules): HeardSpans {
  const nfc = text.normalize('NFC').trim()
  const found = compile(rules).verb.exec(plainSameLength(nfc))
  if (!found) return { source: nfc, content: nfc, verb: null }
  const source = nfc.slice(0, found.index).trim()
  const content = nfc
    .slice(found.index + found[0].length)
    .replace(/^[\s,;:.!?-]+/u, '')
    .trim()
  // A verb at the very start or end leaves nothing useful on one side: use the whole text there.
  return { source: source || nfc, content: content || nfc, verb: nfc.slice(found.index, found.index + found[0].length) }
}

/**
 * Names the referral source from the source span with fixed word lists. A fellow-guest or staff word counts
 * only next to a lodging word (and not inside it: "nyumba ya wageni" is lodging, not a guest).
 * Returns null when no rule fires, and Unclear when rules for two different sources fire.
 */
export function referralByRules(source: string, rules: ReferralRules): RuleResult | null {
  const c = compile(rules)
  const plain = plainSameLength(source.normalize('NFC'))
  const lodging = c.lodging.test(plain)
  const rest = lodging ? plain.replace(c.lodgingAll, ' ') : plain

  const fired: [RuleCategory, string][] = []
  if (lodging && c.fellowGuest.test(rest)) fired.push(['guesthouse_guest', 'lodging+guest'])
  if (lodging && c.staff.test(rest)) fired.push(['guesthouse_staff', 'lodging+staff'])
  if (c.guide.test(rest)) fired.push(['local_guide', 'guide'])
  if (c.friendFamily.test(rest)) fired.push(['friend_family', 'friend_family'])
  if (c.online.test(rest)) fired.push(['social_online', 'online'])

  if (fired.length === 0) return null
  if (fired.length > 1) return { category: 'unclear', rule: `conflict:${fired.map(([, rule]) => rule).join('+')}` }
  return { category: fired[0][0], rule: fired[0][1] }
}
