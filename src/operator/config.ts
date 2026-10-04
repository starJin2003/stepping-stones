import type { Lang } from '../i18n/strings.ts'

/** Everything specific to one tourism operator. Components read this; they never name an operator themselves. */
export interface OperatorConfig {
  id: string
  /** The business, e.g. a farm or guesthouse name. */
  display_name: string
  /** The person who receives the SMS summary. */
  owner_name: string
  /** Always includes Other and Unclear. Labels in both UI languages. */
  visit_reasons: { id: string; label: Record<Lang, string> }[]
  /** The two questions printed on the tourist card. */
  card_questions: { en: [string, string]; sw: [string, string] }
}

export const REQUIRED_VISIT_REASON_IDS = ['other', 'unclear'] as const

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

function isQuestionPair(v: unknown): v is [string, string] {
  return Array.isArray(v) && v.length === 2 && v.every(isText)
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

  const questions = c.card_questions as Record<string, unknown> | undefined
  if (!isQuestionPair(questions?.en) || !isQuestionPair(questions?.sw)) fail('card_questions needs two en and two sw questions')

  return raw as OperatorConfig
}
