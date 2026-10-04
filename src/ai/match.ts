import type { MatchStrength } from '../db/types.ts'
import type { Thresholds } from './config.ts'
import { cosine } from './embed.ts'
import { center, neighbourhood, ratioMargin, type LanguageMeans } from './language-space.ts'

/** Referral sources where the person who told them could be an earlier visitor. */
export const VISITOR_REFERRALS: ReadonlySet<string> = new Set(['friend_family', 'guesthouse_guest'])

export interface MatchableRecord {
  record_id: string
  received_at: string
  format_ok: boolean | null
  incoming_embedding: Float32Array | null
  outgoing_embedding: Float32Array | null
  referral_source_category: string | null
  detected_language?: string | null
}

/** How well an earlier visitor's would-tell story fits what a new visitor heard. Higher is closer. */
export type Scorer = (target: MatchableRecord, candidate: MatchableRecord) => number

export const plainCosine: Scorer = (target, candidate) => cosine(target.incoming_embedding!, candidate.outgoing_embedding!)

export interface MatchOptions {
  matching: Thresholds['matching']
  means: LanguageMeans
}

/**
 * The scorer for one matching run over `records`. Centering subtracts each text's language mean; ratio margin
 * divides the cosine by how crowded the neighbourhoods of the two texts are (other visitors only), so a story
 * that is close to everything stops winning by default. Both off: plain cosine.
 */
export function buildScorer(records: MatchableRecord[], options?: MatchOptions): Scorer {
  const { center_by_language: centering, ratio_margin: margin, margin_k: kMax } = options?.matching ?? {}
  if (!options || (!centering && !margin)) return plainCosine
  const prep = (v: Float32Array, r: MatchableRecord) => (centering ? center(v, r.detected_language ?? null, options.means) : v)
  const heard = new Map(records.filter((r) => r.incoming_embedding).map((r) => [r.record_id, prep(r.incoming_embedding!, r)]))
  const tell = new Map(records.filter((r) => r.outgoing_embedding).map((r) => [r.record_id, prep(r.outgoing_embedding!, r)]))
  const pair = (target: MatchableRecord, candidate: MatchableRecord) =>
    cosine(heard.get(target.record_id)!, tell.get(candidate.record_id)!)
  if (!margin) return pair

  const others = (pool: Map<string, Float32Array>, id: string) => [...pool].filter(([other]) => other !== id).map(([, v]) => v)
  const heardCrowd = new Map([...heard].map(([id, v]) => [id, neighbourhood(v, others(tell, id), kMax!)]))
  const tellCrowd = new Map([...tell].map(([id, v]) => [id, neighbourhood(v, others(heard, id), kMax!)]))
  return (target, candidate) =>
    ratioMargin(pair(target, candidate), heardCrowd.get(target.record_id)!, tellCrowd.get(candidate.record_id)!)
}

export interface MatchResult {
  candidate_prior_record_ids: string[]
  match_strength: MatchStrength
  /** For scripts and calibration only. Never shown in the UI. */
  scores: { record_id: string; score: number }[]
}

const UNCLEAR_NO_CANDIDATE: MatchResult = { candidate_prior_record_ids: [], match_strength: 'Unclear', scores: [] }

/**
 * Compares what this visitor heard with what each earlier visitor said they would tell a friend.
 * Only records received before this one are candidates. Never confirms anything.
 */
export function findMatch(
  target: MatchableRecord,
  all: MatchableRecord[],
  thresholds: Thresholds['match'],
  score: Scorer = plainCosine,
): MatchResult {
  if (!target.format_ok || !target.incoming_embedding) return UNCLEAR_NO_CANDIDATE
  const before = Date.parse(target.received_at)
  // Raises every score equally, so it changes strength, not ranking.
  const bonus = VISITOR_REFERRALS.has(target.referral_source_category ?? '') ? thresholds.referral_bonus : 0

  const ranked = all
    .filter((r) => r.record_id !== target.record_id && r.outgoing_embedding && Date.parse(r.received_at) < before)
    .map((r) => ({ record_id: r.record_id, score: score(target, r) + bonus, time: Date.parse(r.received_at) }))
    // Date only breaks exact ties: the more recent earlier visit first.
    .sort((a, b) => b.score - a.score || b.time - a.time)
  if (ranked.length === 0) return UNCLEAR_NO_CANDIDATE

  const top = ranked[0].score
  const margin = top - (ranked[1]?.score ?? 0)
  const strength: MatchStrength =
    top >= thresholds.strong && margin >= thresholds.strong_margin
      ? 'Strong'
      : top >= thresholds.possible && margin >= thresholds.possible_margin
        ? 'Possible'
        : 'Unclear'

  const shortlist = ranked.slice(0, thresholds.top_k)
  return {
    candidate_prior_record_ids: shortlist.map((r) => r.record_id),
    match_strength: strength,
    scores: shortlist.map(({ record_id, score }) => ({ record_id, score })),
  }
}
