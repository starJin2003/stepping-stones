import { PROTOTYPE_LANGS, type PrototypeSentences } from '../ai/config.ts'
import { REFERRAL_SOURCES, type Lang, type ReferralSource } from '../i18n/strings.ts'

/**
 * The owner's SMS summary: fixed Gĩkũyũ templates filled from counts, never generated. Each part is sent
 * as its own SMS. `en` is what the part means, shown under it in the app. Gĩkũyũ labels for the categories
 * live here too. All Gĩkũyũ is machine translation until a native speaker has checked it.
 */
export interface SummaryTemplates {
  status: string
  parts: { kik: string; en: string }[]
  labels: {
    referral_sources: Record<Exclude<ReferralSource, 'unclear'>, string>
    /** Every visit reason except Unclear, by id. */
    visit_reasons: Record<string, string>
    /** Used when no category stands out yet. */
    none: { kik: string; en: string }
  }
}

/** Placeholders a summary template may use. */
export const SUMMARY_PLACEHOLDERS = ['since', 'visitors', 'referred', 'top_referral', 'top_pass_on', 'needs_review'] as const
export type SummaryPlaceholder = (typeof SUMMARY_PLACEHOLDERS)[number]
export const MAX_SUMMARY_PARTS = 6

/** Everything specific to one tourism operator. Components read this; they never name an operator themselves. */
export interface OperatorConfig {
  id: string
  /** The business, e.g. a farm or guesthouse name. */
  display_name: string
  /** The person who receives the SMS summary. */
  owner_name: string
  /**
   * Always includes Other and Unclear. Labels in both UI languages. Every category except Unclear has
   * prototype sentences for classification; Unclear is the fallback and has none.
   */
  visit_reasons: { id: string; label: Record<Lang, string>; prototypes?: PrototypeSentences }[]
  /** The two questions printed on the tourist card. */
  card_questions: { en: [string, string]; sw: [string, string] }
  summary_templates: SummaryTemplates
}

export const REQUIRED_VISIT_REASON_IDS = ['other', 'unclear'] as const

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

function isQuestionPair(v: unknown): v is [string, string] {
  return Array.isArray(v) && v.length === 2 && v.every(isText)
}

const placeholdersOf = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

/** Checks the summary templates against the visit-reason ids. Returns the first problem, or null. */
function summaryProblem(raw: unknown, reasonIds: string[]): string | null {
  const s = raw as Record<string, unknown> | undefined
  if (!s || typeof s !== 'object') return 'summary_templates missing'
  if (!isText(s.status) || !s.status.includes('native-speaker validation pending')) {
    return 'summary_templates.status must say native-speaker validation pending'
  }
  const parts = s.parts
  if (!Array.isArray(parts) || parts.length === 0 || parts.length > MAX_SUMMARY_PARTS) {
    return `summary_templates.parts needs 1 to ${MAX_SUMMARY_PARTS} parts`
  }
  for (const [i, part] of parts.entries()) {
    if (!isText(part?.kik) || !isText(part?.en)) return `summary part ${i + 1} needs kik and en`
    if (part.kik !== part.kik.normalize('NFC')) return `summary part ${i + 1} must be NFC (ĩ and ũ as single characters)`
    const used = placeholdersOf(part.kik)
    if (used.join() !== placeholdersOf(part.en).join()) return `summary part ${i + 1} kik and en use different placeholders`
    const unknown = used.find((p) => !(SUMMARY_PLACEHOLDERS as readonly string[]).includes(p))
    if (unknown) return `summary part ${i + 1} has unknown placeholder {${unknown}}`
  }
  const labels = s.labels as Record<string, Record<string, unknown>> | undefined
  for (const source of REFERRAL_SOURCES) {
    if (source !== 'unclear' && !isText(labels?.referral_sources?.[source])) return `summary label for referral source ${source}`
  }
  for (const id of reasonIds) {
    if (id !== 'unclear' && !isText(labels?.visit_reasons?.[id])) return `summary label for visit reason ${id}`
  }
  const none = labels?.none as Record<string, unknown> | undefined
  if (!isText(none?.kik) || !isText(none?.en)) return 'summary label none needs kik and en'
  const allLabels = [...Object.values(labels!.referral_sources), ...Object.values(labels!.visit_reasons), none!.kik]
  if (allLabels.some((l) => typeof l === 'string' && l !== l.normalize('NFC'))) return 'summary labels must be NFC'
  return null
}

/** Validates raw JSON and returns it typed. Throws naming the first problem. */
export function parseOperatorConfig(raw: unknown): OperatorConfig {
  const fail = (problem: string): never => {
    throw new Error(`Invalid operator config: ${problem}`)
  }
  if (typeof raw !== 'object' || raw === null) return fail('not an object')
  const c = raw as Record<string, unknown>

  if (!isText(c.id)) fail('id')
  if (!isText(c.display_name)) fail('display_name')
  if (!isText(c.owner_name)) fail('owner_name')

  const reasons = c.visit_reasons
  if (!Array.isArray(reasons) || !reasons.every((r) => isText(r?.id) && isText(r?.label?.sw) && isText(r?.label?.en))) {
    fail('visit_reasons need an id and sw and en labels')
  }
  const ids = (reasons as { id: string }[]).map((r) => r.id)
  if (new Set(ids).size !== ids.length) fail('visit_reasons has duplicate ids')
  for (const required of REQUIRED_VISIT_REASON_IDS) {
    if (!ids.includes(required)) fail(`visit_reasons must include ${required}`)
  }
  for (const r of reasons as { id: string; prototypes?: Record<string, unknown> }[]) {
    if (r.id === 'unclear') {
      if (r.prototypes) fail('unclear is the fallback and must not have prototypes')
      continue
    }
    for (const lang of PROTOTYPE_LANGS) {
      const sentences = r.prototypes?.[lang]
      if (!Array.isArray(sentences) || sentences.length < 3 || sentences.length > 5 || !sentences.every(isText)) {
        fail(`${r.id} needs 3 to 5 ${lang} prototype sentences`)
      }
    }
  }

  const questions = c.card_questions as Record<string, unknown> | undefined
  if (!isQuestionPair(questions?.en) || !isQuestionPair(questions?.sw)) fail('card_questions needs two en and two sw questions')

  const summary = summaryProblem(c.summary_templates, ids)
  if (summary) fail(summary)

  return raw as OperatorConfig
}

/** Visit-reason prototype sentences by category id, for the analysis. */
export const visitReasonPrototypes = (config: OperatorConfig): Record<string, PrototypeSentences> =>
  Object.fromEntries(config.visit_reasons.flatMap((r) => (r.prototypes ? [[r.id, r.prototypes]] : [])))
