import type { VisitRecord } from '../db/types.ts'
import { classify, UNCLEAR, type EmbeddedPrototype } from './classify.ts'
import { flattenPrototypes, type PrototypeSentences, type Thresholds } from './config.ts'
import type { Embed } from './embed.ts'
import { detectLanguage } from './language.ts'
import { findMatch, type MatchableRecord, type MatchResult } from './match.ts'
import { parse } from './parse.ts'
import { referralByRules, splitHeard } from './referral.ts'
import type { AnalysisSetup } from './setup.ts'

const EMBED_BATCH = 16

export interface Prototypes {
  visitReasons: EmbeddedPrototype[]
  referrals: EmbeddedPrototype[]
}

export async function embedInBatches(texts: string[], embed: Embed, onBatch?: (done: number) => void): Promise<Float32Array[]> {
  const out: Float32Array[] = []
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    out.push(...(await embed(texts.slice(i, i + EMBED_BATCH))))
    onBatch?.(out.length)
  }
  return out
}

export async function embedPrototypes(setup: AnalysisSetup, embed: Embed): Promise<Prototypes> {
  const embedSet = async (set: Record<string, PrototypeSentences>) => {
    const flat = flattenPrototypes(set)
    const vectors = await embedInBatches(
      flat.map((p) => p.text),
      embed,
    )
    return flat.map((p, i) => ({ category: p.category, vector: vectors[i] }))
  }
  return { visitReasons: await embedSet(setup.visitReasonPrototypes), referrals: await embedSet(setup.referralPrototypes) }
}

export type TextAnalysis = Pick<
  VisitRecord,
  | 'incoming_story_text'
  | 'outgoing_story_text'
  | 'format_ok'
  | 'detected_language'
  | 'incoming_embedding'
  | 'outgoing_embedding'
  | 'referral_source_category'
  | 'referral_rule'
  | 'visit_reason_category'
  | 'pass_on_category'
>

/**
 * Parses, detects language, embeds and classifies each raw SMS. Record text is only read, never changed.
 * Answer 1 is split at its first reporting verb. Heard from comes from the source span: fixed word rules first,
 * the model on that span only when no rule fires. Came for and matching use the content span, what the visitor
 * heard. Would tell friends about is the same taxonomy applied to the whole of answer 2.
 */
export async function analyseTexts(
  raws: string[],
  setup: AnalysisSetup,
  prototypes: Prototypes,
  embed: Embed,
  onProgress?: (done: number, total: number) => void,
): Promise<TextAnalysis[]> {
  const parsed = raws.map(parse)
  const heard = parsed.map((p) => (p.incoming_story_text ? splitHeard(p.incoming_story_text, setup.referralRules) : null))
  const ruled = heard.map((h) => (h ? referralByRules(h.source, setup.referralRules) : null))
  const texts: string[] = []
  const slot = (text: string | undefined) => (text ? texts.push(text) - 1 : -1)
  const slots = parsed.map((p, i) => ({
    content: slot(heard[i]?.content),
    outgoing: slot(p.outgoing_story_text),
    // The source span is embedded only when no rule named the source.
    source: ruled[i] ? -1 : slot(heard[i]?.source),
  }))
  const vectors = await embedInBatches(texts, embed, (done) => onProgress?.(done, texts.length))
  const vector = (at: number) => (at >= 0 ? vectors[at] : null)
  const th = setup.thresholds

  return parsed.map((p, i) => {
    const content = vector(slots[i].content)
    const outgoing = vector(slots[i].outgoing)
    const source = vector(slots[i].source)
    const rule = ruled[i]
    return {
      incoming_story_text: p.incoming_story_text,
      outgoing_story_text: p.outgoing_story_text,
      format_ok: p.format_ok,
      detected_language: detectLanguage(raws[i], setup.functionWords, th.language),
      // Matching compares what this visitor heard (the content span) with what earlier visitors would tell.
      incoming_embedding: content,
      outgoing_embedding: outgoing,
      referral_source_category: rule ? rule.category : source ? classify(source, prototypes.referrals, th.classify).category : UNCLEAR,
      referral_rule: rule ? rule.rule : source ? 'embedding' : null,
      visit_reason_category: content ? classify(content, prototypes.visitReasons, th.classify).category : UNCLEAR,
      pass_on_category: outgoing ? classify(outgoing, prototypes.visitReasons, th.classify).category : UNCLEAR,
    }
  })
}

/** What analysis writes to a record. Never review_status or confirmed_prior_record_id: only a person sets those. */
export type AnalysisPatch = Partial<TextAnalysis> &
  Pick<VisitRecord, 'candidate_prior_record_ids' | 'match_strength' | 'analysis_version'>

/**
 * Reads every record that is new or out of date, then re-matches those and every record still waiting for a
 * person (their earlier candidates may have changed). Returns only the fields analysis owns, so writing
 * a patch with a partial update leaves a person's decision alone, even one made while this was running.
 */
export async function analysisPatches(
  all: VisitRecord[],
  setup: AnalysisSetup,
  prototypes: Prototypes,
  embed: Embed,
  version: string,
): Promise<Map<string, AnalysisPatch>> {
  const stale = all.filter((r) => r.analysis_version !== version)
  const readings = await analyseTexts(
    stale.map((r) => r.raw_text_local),
    setup,
    prototypes,
    embed,
  )
  const fresh = new Map(stale.map((r, i) => [r.record_id, readings[i]]))
  const merged: VisitRecord[] = all.map((r) => ({ ...r, ...fresh.get(r.record_id) }))
  const targets = merged.filter((r) => fresh.has(r.record_id) || r.review_status === 'Pending').map((r) => r.record_id)
  const matches = matchRecords(merged, targets, setup.thresholds.match)

  return new Map(
    targets.map((id) => {
      const match = matches.get(id)!
      const patch: AnalysisPatch = {
        ...fresh.get(id),
        candidate_prior_record_ids: match.candidate_prior_record_ids,
        match_strength: match.match_strength,
        analysis_version: version,
      }
      return [id, patch]
    }),
  )
}

/** Match results for the target records against every earlier record. Sets strength and candidates only. */
export function matchRecords(
  records: MatchableRecord[],
  targetIds: Iterable<string>,
  thresholds: Thresholds['match'],
): Map<string, MatchResult> {
  const byId = new Map(records.map((r) => [r.record_id, r]))
  const results = new Map<string, MatchResult>()
  for (const id of targetIds) {
    const target = byId.get(id)
    if (target) results.set(id, findMatch(target, records, thresholds))
  }
  return results
}
