import type { MatchStrength } from '../db/types.ts'
import type { Thresholds } from './config.ts'
import { cosine } from './embed.ts'

/** Referral sources where the person who told them could be an earlier visitor. */
export const VISITOR_REFERRALS: ReadonlySet<string> = new Set(['friend_family', 'guesthouse_guest'])

export interface MatchableRecord {
  record_id: string
  received_at: string
  format_ok: boolean | null
  incoming_embedding: Float32Array | null
  outgoing_embedding: Float32Array | null
  referral_source_category: string | null
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
export function findMatch(target: MatchableRecord, all: MatchableRecord[], thresholds: Thresholds['match']): MatchResult {
  if (!target.format_ok || !target.incoming_embedding) return UNCLEAR_NO_CANDIDATE
  const incoming = target.incoming_embedding
  const before = Date.parse(target.received_at)
  // Raises every score equally, so it changes strength, not ranking.
  const bonus = VISITOR_REFERRALS.has(target.referral_source_category ?? '') ? thresholds.referral_bonus : 0

  const ranked = all
    .filter((r) => r.record_id !== target.record_id && r.outgoing_embedding && Date.parse(r.received_at) < before)
    .map((r) => ({ record_id: r.record_id, score: cosine(incoming, r.outgoing_embedding!) + bonus, time: Date.parse(r.received_at) }))
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
