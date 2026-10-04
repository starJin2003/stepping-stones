// Data the analysis needs, loaded the same way in the browser and in Node scripts.
import kikWords from '../../data/lid/kik-function-words.json' with { type: 'json' }
import referralFile from '../../data/ai/referral-prototypes.json' with { type: 'json' }
import referralRulesFile from '../../data/ai/referral-rules.json' with { type: 'json' }
import languageMeansFile from '../../data/ai/language-means.json' with { type: 'json' }
import thresholdsFile from './thresholds.json' with { type: 'json' }

export type Language = 'English' | 'Kiswahili' | 'Gikuyu' | 'German' | 'French' | 'Unknown'
export const LANGUAGES: Language[] = ['English', 'Kiswahili', 'Gikuyu', 'German', 'French', 'Unknown']

export type PrototypeLang = 'en' | 'sw' | 'de' | 'fr'
export const PROTOTYPE_LANGS: PrototypeLang[] = ['en', 'sw', 'de', 'fr']

/** Prototype sentences per category, in each prototype language. No Gĩkũyũ: we cannot validate it. */
export type PrototypeSentences = Record<PrototypeLang, string[]>

export interface Thresholds {
  language: { min_chars: number; min_words: number; franc_min_margin: number; gikuyu_min_share: number }
  classify: { min_score: number; min_margin: number }
  match: {
    strong: number
    strong_margin: number
    possible: number
    possible_margin: number
    referral_bonus: number
    top_k: number
  }
  /** One switch each, kept on only when it improves the synthetic dev split. */
  matching: { center_by_language: boolean; ratio_margin: boolean; margin_k: number }
}

export const THRESHOLDS: Thresholds = thresholdsFile

export const REFERRAL_PROTOTYPES: Record<string, PrototypeSentences> = referralFile.categories

/** A word list per language (en, de, fr, sw). */
export type WordLists = Record<string, string[]>

/** Fixed word lists for Heard from: the reporting verbs that end the source span, and the words each rule needs. */
export interface ReferralRules {
  reporting_verbs: WordLists
  lodging: WordLists
  fellow_guest: WordLists
  staff: WordLists
  guide: WordLists
  friend_family: WordLists
  online: WordLists
}

export const REFERRAL_RULES: ReferralRules = referralRulesFile

/** Mean embedding per language from FLORES-200 dev, for centering by language. */
export const LANGUAGE_MEANS: Record<string, number[]> = (languageMeansFile as { means: Record<string, number[]> }).means

/** Accent-free forms, so "uria" matches "ũrĩa" in text typed without ĩ ũ. */
export const plainWord = (word: string): string => word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

export const KIK_FUNCTION_WORDS: ReadonlySet<string> = new Set(kikWords.words.map((w) => plainWord(w.word)))

/** Flattens prototype sentences into one list, for embedding. */
export function flattenPrototypes(byCategory: Record<string, PrototypeSentences>): { category: string; text: string }[] {
  return Object.entries(byCategory).flatMap(([category, langs]) =>
    PROTOTYPE_LANGS.flatMap((lang) => langs[lang].map((text) => ({ category, text }))),
  )
}

/** Short stable hash (FNV-1a) of anything JSON-serializable. */
export function hashOf(value: unknown): string {
  let h = 0x811c9dc5
  for (const ch of JSON.stringify(value)) {
    h ^= ch.codePointAt(0)!
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
