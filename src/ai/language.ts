import { francAll } from 'franc'
import { plainWord, type Language, type Thresholds } from './config.ts'

const FRANC_CODES: Record<string, Language> = { eng: 'English', swh: 'Kiswahili', deu: 'German', fra: 'French' }

/**
 * Language of a message: Gĩkũyũ by rule (franc has no Gĩkũyũ and calls it Javanese), otherwise franc
 * restricted to four languages. Short or ambiguous text is Unknown rather than a guess.
 */
export function detectLanguage(
  text: string,
  functionWords: ReadonlySet<string>,
  thresholds: Thresholds['language'],
): Language {
  const words = text.normalize('NFC').toLowerCase().match(/\p{L}+/gu) ?? []
  if (text.trim().length < thresholds.min_chars || words.length < thresholds.min_words) return 'Unknown'

  // Words with ĩ or ũ, or Gĩkũyũ function words (compared without accents).
  const gikuyuWords = words.filter((w) => /[ĩũ]/u.test(w) || functionWords.has(plainWord(w))).length
  if (gikuyuWords / words.length >= thresholds.gikuyu_min_share) return 'Gikuyu'

  const ranked = francAll(text, { only: Object.keys(FRANC_CODES), minLength: thresholds.min_chars })
  const [best, runnerUp] = ranked
  if (!best || best[0] === 'und') return 'Unknown'
  if (runnerUp && best[1] - runnerUp[1] < thresholds.franc_min_margin) return 'Unknown'
  return FRANC_CODES[best[0]] ?? 'Unknown'
}
