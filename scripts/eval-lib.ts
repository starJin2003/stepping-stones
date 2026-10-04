/**
 * Shared by scripts/calibrate.ts (synthetic dev only) and scripts/eval.ts (reports, synthetic test only):
 * loading a synthetic set, running the same src/ai pipeline as the phone, and scoring it against gold labels.
 */
import { readFileSync } from 'node:fs'
import noorCoffee from '../data/operators/noor-coffee.json' with { type: 'json' }
import { analyseTexts, embedPrototypes, matchOptions, matchRecords, type Prototypes, type TextAnalysis } from '../src/ai/analyze.ts'
import { KIK_FUNCTION_WORDS, LANGUAGE_MEANS, REFERRAL_PROTOTYPES, REFERRAL_RULES, THRESHOLDS, type Thresholds } from '../src/ai/config.ts'
import { createEmbedder, type Embed } from '../src/ai/embed.ts'
import type { MatchResult } from '../src/ai/match.ts'
import { MODEL } from '../src/ai/model.ts'
import type { AnalysisSetup } from '../src/ai/setup.ts'
import { parseOperatorConfig, visitReasonPrototypes } from '../src/operator/config.ts'
import { wasmExtractor } from './wasm-embed.ts'

export interface EvalRecord {
  record_id: string
  received_at: string
  language: 'en' | 'de' | 'fr' | 'sw'
  raw_text: string
  synthetic: true
  gold: {
    referral: string
    came_for: string | null
    would_tell: string | null
    link: string | null
    kind: 'start' | 'link' | 'near_miss' | 'ambiguous' | 'format'
  }
}

export const loadSet = (split: 'dev' | 'test'): EvalRecord[] =>
  JSON.parse(readFileSync(`data/eval/${split}.synthetic.json`, 'utf8')).records

/** Embeds each distinct text once, so re-running the pipeline with other thresholds or switches is instant. */
export async function cachedEmbedder(): Promise<{ embed: Embed; raw: Embed }> {
  const raw = createEmbedder(await wasmExtractor())
  const cache = new Map<string, Float32Array>()
  const embed: Embed = async (texts) => {
    const missing = [...new Set(texts.filter((t) => !cache.has(t)))]
    if (missing.length) (await raw(missing)).forEach((v, i) => cache.set(missing[i], v))
    return texts.map((t) => cache.get(t)!)
  }
  return { embed, raw }
}

export function setupWith(thresholds: Thresholds = THRESHOLDS): AnalysisSetup {
  return {
    thresholds,
    functionWords: KIK_FUNCTION_WORDS,
    visitReasonPrototypes: visitReasonPrototypes(parseOperatorConfig(noorCoffee)),
    referralPrototypes: REFERRAL_PROTOTYPES,
    referralRules: REFERRAL_RULES,
    languageMeans: LANGUAGE_MEANS,
    modelRevision: MODEL.revision,
  }
}

export type Analysed = EvalRecord & TextAnalysis

export async function analyseSet(records: EvalRecord[], setup: AnalysisSetup, prototypes: Prototypes, embed: Embed): Promise<Analysed[]> {
  const readings = await analyseTexts(
    records.map((r) => r.raw_text),
    setup,
    prototypes,
    embed,
  )
  return records.map((r, i) => ({ ...r, ...readings[i] }))
}

export const prototypesFor = (setup: AnalysisSetup, embed: Embed) => embedPrototypes(setup, embed)

/** Every record matched against the earlier records of its own set, as the app does. */
export const matchSet = (analysed: Analysed[], setup: AnalysisSetup): Map<string, MatchResult> =>
  matchRecords(
    analysed,
    analysed.map((r) => r.record_id),
    setup.thresholds.match,
    matchOptions(setup),
  )

const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : null)

export interface LinkMetrics {
  linked: number
  top1: number
  top1_pct: number | null
  same_language: { n: number; top1: number; pct: number | null }
  cross_language: { n: number; top1: number; pct: number | null }
  /** A Strong label on a wrong top candidate: wrong earlier visitor, or a record whose right answer is none or Unclear. */
  wrong_strong: number
  wrong_possible: number
  correct_strong: number
  correct_possible: number
  ambiguous: number
  ambiguous_unclear: number
  ambiguous_unclear_pct: number | null
  /** Near misses where a same-language record that is not the source was proposed (Strong or Possible). */
  near_miss_wrong_same_language_proposed: number
  near_misses: number
}

export function linkMetrics(analysed: Analysed[], matches: Map<string, MatchResult>): LinkMetrics {
  const byId = new Map(analysed.map((r) => [r.record_id, r]))
  const linked = analysed.filter((r) => r.gold.link)
  const isTop = (r: Analysed) => matches.get(r.record_id)?.candidate_prior_record_ids[0] === r.gold.link
  const sameLanguage = linked.filter((r) => byId.get(r.gold.link!)!.language === r.language)
  const cross = linked.filter((r) => byId.get(r.gold.link!)!.language !== r.language)
  let wrongStrong = 0
  let wrongPossible = 0
  let correctStrong = 0
  let correctPossible = 0
  for (const r of analysed) {
    const m = matches.get(r.record_id)!
    const right = r.gold.link !== null && m.candidate_prior_record_ids[0] === r.gold.link
    if (m.match_strength === 'Strong') right ? correctStrong++ : wrongStrong++
    if (m.match_strength === 'Possible') right ? correctPossible++ : wrongPossible++
  }
  const ambiguous = analysed.filter((r) => r.gold.kind === 'ambiguous')
  const ambiguousUnclear = ambiguous.filter((r) => matches.get(r.record_id)!.match_strength === 'Unclear').length
  const nearMisses = analysed.filter((r) => r.gold.kind === 'near_miss')
  const sameOnTop = nearMisses.filter((r) => {
    const m = matches.get(r.record_id)!
    const top = m.candidate_prior_record_ids[0]
    return top && top !== r.gold.link && m.match_strength !== 'Unclear' && byId.get(top)!.language === r.language
  }).length
  const top1 = linked.filter(isTop).length
  return {
    linked: linked.length,
    top1,
    top1_pct: pct(top1, linked.length),
    same_language: { n: sameLanguage.length, top1: sameLanguage.filter(isTop).length, pct: pct(sameLanguage.filter(isTop).length, sameLanguage.length) },
    cross_language: { n: cross.length, top1: cross.filter(isTop).length, pct: pct(cross.filter(isTop).length, cross.length) },
    wrong_strong: wrongStrong,
    wrong_possible: wrongPossible,
    correct_strong: correctStrong,
    correct_possible: correctPossible,
    ambiguous: ambiguous.length,
    ambiguous_unclear: ambiguousUnclear,
    ambiguous_unclear_pct: pct(ambiguousUnclear, ambiguous.length),
    near_miss_wrong_same_language_proposed: sameOnTop,
    near_misses: nearMisses.length,
  }
}

export interface ReadingMetrics {
  referral: { n: number; correct: number; pct: number | null; by_rule: number; by_rule_pct: number | null; rule_correct: number }
  came_for: { n: number; correct: number; pct: number | null }
  would_tell: { n: number; correct: number; pct: number | null }
}

export function readingMetrics(analysed: Analysed[]): ReadingMetrics {
  const byRule = analysed.filter((r) => r.referral_rule && r.referral_rule !== 'embedding')
  const score = (field: 'came_for' | 'would_tell', key: 'visit_reason_category' | 'pass_on_category') => {
    const scored = analysed.filter((r) => r.gold[field] !== null)
    const correct = scored.filter((r) => r[key] === r.gold[field]).length
    return { n: scored.length, correct, pct: pct(correct, scored.length) }
  }
  const referralCorrect = analysed.filter((r) => r.referral_source_category === r.gold.referral).length
  return {
    referral: {
      n: analysed.length,
      correct: referralCorrect,
      pct: pct(referralCorrect, analysed.length),
      by_rule: byRule.length,
      by_rule_pct: pct(byRule.length, analysed.length),
      rule_correct: byRule.filter((r) => r.referral_source_category === r.gold.referral).length,
    },
    came_for: score('came_for', 'visit_reason_category'),
    would_tell: score('would_tell', 'pass_on_category'),
  }
}

export const withMatching = (t: Thresholds, matching: Thresholds['matching'], match = t.match): Thresholds => ({
  ...t,
  matching,
  match,
})

/** Top score, gap to the runner-up, and whether the top candidate is right, for every record with a candidate. */
export function scored(records: Analysed[], matching: Thresholds['matching']) {
  const open: Thresholds['match'] = { ...THRESHOLDS.match, strong: 99, possible: 99 }
  const matches = matchSet(records, setupWith(withMatching(THRESHOLDS, matching, open)))
  return records.flatMap((r) => {
    const m = matches.get(r.record_id)!
    if (!m.scores.length) return []
    const [top, second] = m.scores
    return [{ id: r.record_id, top: top.score, gap: top.score - (second?.score ?? 0), right: r.gold.link !== null && top.record_id === r.gold.link }]
  })
}

/** On dev only. Strong: no wrong Strong, then the most right ones. Possible: right minus twice wrong, at most Strong. */
export function searchThresholds(rows: ReturnType<typeof scored>) {
  const levels = [...new Set(rows.map((r) => Number(r.top.toFixed(3))))].sort((a, b) => a - b)
  const gaps = [0, 0.005, 0.01, 0.02, 0.03, 0.05, 0.08]
  const count = (t: number, g: number, upTo = Infinity, upGap = Infinity) => {
    const hit = rows.filter((r) => r.top >= t && r.gap >= g && !(r.top >= upTo && r.gap >= upGap))
    return { right: hit.filter((r) => r.right).length, wrong: hit.filter((r) => !r.right).length }
  }
  let strong = { t: 99, g: 0, right: 0, wrong: 0 }
  for (const t of levels) for (const g of gaps) {
    const c = count(t, g)
    if (c.wrong === 0 && (c.right > strong.right || (c.right === strong.right && t + g < strong.t + strong.g))) strong = { t, g, ...c }
  }
  let possible = { t: strong.t, g: strong.g, right: 0, wrong: 0, value: 0 }
  for (const t of levels.filter((l) => l <= strong.t)) for (const g of gaps) {
    const c = count(t, g, strong.t, strong.g)
    const value = c.right - 2 * c.wrong
    if (value > possible.value) possible = { t, g, ...c, value }
  }
  return { strong, possible }
}
