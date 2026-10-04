import { describe, expect, it, vi } from 'vitest'
import { analyseTexts, matchRecords } from '../../src/ai/analyze.ts'
import { classify, type EmbeddedPrototype } from '../../src/ai/classify.ts'
import { KIK_FUNCTION_WORDS, THRESHOLDS, type Thresholds } from '../../src/ai/config.ts'
import { createEmbedder, E5_PREFIX, type Extractor } from '../../src/ai/embed.ts'
import { findMatch, type MatchableRecord } from '../../src/ai/match.ts'

/** A unit vector at `angle` degrees in a plane: cosine between two is cos(difference). */
const at = (degrees: number) => {
  const r = (degrees * Math.PI) / 180
  return new Float32Array([Math.cos(r), Math.sin(r), 0])
}
/** Angle whose cosine is `score`, so tests can ask for exact similarities. */
const scoring = (score: number) => (Math.acos(score) * 180) / Math.PI

// Fixed numbers for the tests, so they do not change when thresholds.json is calibrated.
const MATCH: Thresholds['match'] = {
  strong: 0.88,
  strong_margin: 0.03,
  possible: 0.85,
  possible_margin: 0.01,
  referral_bonus: 0.01,
  top_k: 3,
}
const CLASSIFY: Thresholds['classify'] = { min_score: 0.8, min_margin: 0.02 }

function record(id: string, day: number, outgoingScore: number | null, extra: Partial<MatchableRecord> = {}): MatchableRecord {
  return {
    record_id: id,
    received_at: `2026-09-${String(day).padStart(2, '0')}T12:00:00.000Z`,
    format_ok: true,
    incoming_embedding: at(0),
    // Earlier visitors' would-tell vectors, placed so their cosine to the target's at(0) is outgoingScore.
    outgoing_embedding: outgoingScore === null ? null : at(scoring(outgoingScore)),
    referral_source_category: 'other',
    ...extra,
  }
}

const target = (extra: Partial<MatchableRecord> = {}) => record('new', 20, null, extra)

describe('findMatch', () => {
  it('Strong: high score and a clear lead', () => {
    const result = findMatch(target(), [record('a', 1, 0.95), record('b', 2, 0.6), target()], MATCH)
    expect(result.match_strength).toBe('Strong')
    expect(result.candidate_prior_record_ids).toEqual(['a', 'b'])
  })

  it('Possible: above the possible threshold but below strong', () => {
    const result = findMatch(target(), [record('a', 1, 0.86), record('b', 2, 0.6)], MATCH)
    expect(result.match_strength).toBe('Possible')
    expect(result.candidate_prior_record_ids[0]).toBe('a')
  })

  it('Unclear: a high score that is too close to the runner-up, still listing the candidates', () => {
    const result = findMatch(target(), [record('a', 1, 0.95), record('b', 2, 0.945)], MATCH)
    expect(result.match_strength).toBe('Unclear')
    expect(result.candidate_prior_record_ids).toEqual(['a', 'b'])
  })

  it('keeps only the top 3 candidates', () => {
    const earlier = [0.9, 0.8, 0.7, 0.6, 0.5].map((s, i) => record(`r${i}`, i + 1, s))
    expect(findMatch(target(), earlier, MATCH).candidate_prior_record_ids).toEqual(['r0', 'r1', 'r2'])
  })

  it('adds a small bonus when the visitor heard from someone who could be an earlier visitor', () => {
    const earlier = [record('a', 1, 0.875), record('b', 2, 0.5)]
    expect(findMatch(target({ referral_source_category: 'local_guide' }), earlier, MATCH).match_strength).toBe('Possible')
    expect(findMatch(target({ referral_source_category: 'guesthouse_guest' }), earlier, MATCH).match_strength).toBe('Strong')
    expect(findMatch(target({ referral_source_category: 'friend_family' }), earlier, MATCH).match_strength).toBe('Strong')
  })

  it('uses date only to break an exact tie: the more recent earlier visit first', () => {
    const result = findMatch(target(), [record('older', 3, 0.9), record('newer', 10, 0.9)], MATCH)
    expect(result.candidate_prior_record_ids).toEqual(['newer', 'older'])
    // A higher score always beats a more recent date.
    expect(findMatch(target(), [record('older', 3, 0.91), record('newer', 10, 0.9)], MATCH).candidate_prior_record_ids[0]).toBe('older')
  })

  it('never matches a record received after (or with) the new one', () => {
    const later = record('later', 25, 1.0)
    const sameTime = record('same', 20, 1.0)
    const result = findMatch(target(), [later, sameTime, record('a', 1, 0.7)], MATCH)
    expect(result.candidate_prior_record_ids).toEqual(['a'])
  })

  it('gives Unclear with no candidate when the format was not recognised', () => {
    const result = findMatch(target({ format_ok: false }), [record('a', 1, 0.99)], MATCH)
    expect(result).toMatchObject({ match_strength: 'Unclear', candidate_prior_record_ids: [] })
  })

  it('gives Unclear with no candidate when there is no incoming story', () => {
    const result = findMatch(target({ incoming_embedding: null }), [record('a', 1, 0.99)], MATCH)
    expect(result).toMatchObject({ match_strength: 'Unclear', candidate_prior_record_ids: [] })
  })

  it('gives Unclear with no candidate when there is no earlier visitor', () => {
    expect(findMatch(target(), [target()], MATCH)).toMatchObject({ match_strength: 'Unclear', candidate_prior_record_ids: [] })
  })

  it('matchRecords only proposes; it returns no review decision', () => {
    const results = matchRecords([record('a', 1, 0.95), target()], ['new'], MATCH)
    expect(Object.keys(results.get('new')!)).toEqual(['candidate_prior_record_ids', 'match_strength', 'scores'])
  })
})

describe('classify', () => {
  const prototypes: EmbeddedPrototype[] = [
    { category: 'coffee', vector: at(0) },
    { category: 'coffee', vector: at(40) },
    { category: 'food', vector: at(90) },
  ]

  it('picks the category with the closest prototype', () => {
    expect(classify(at(5), prototypes, CLASSIFY).category).toBe('coffee')
    expect(classify(at(88), prototypes, CLASSIFY).category).toBe('food')
  })

  it('is Unclear below the threshold', () => {
    expect(classify(at(180), prototypes, CLASSIFY).category).toBe('unclear')
  })

  it('is Unclear when the runner-up category is too close', () => {
    // Halfway between coffee (40) and food (90): equal scores.
    expect(classify(at(65), [prototypes[1], prototypes[2]], { min_score: 0.5, min_margin: 0.02 }).category).toBe('unclear')
  })

  it('is Unclear without a vector', () => {
    expect(classify(null, prototypes, CLASSIFY).category).toBe('unclear')
  })
})

describe('embed', () => {
  function fakeModel() {
    return vi.fn<Extractor>(async (texts) => ({
      data: Float32Array.from(texts.flatMap((_, i) => [i, i + 0.5])),
      dims: [texts.length, 2],
    }))
  }

  it('adds the e5 prefix exactly once, inside embed', async () => {
    const model = fakeModel()
    const embed = createEmbedder(model)
    const vectors = await embed(['A friend told me', 'query: already prefixed', '  passage: other prefix  '])

    const [inputs, options] = model.mock.calls[0]
    expect(inputs).toEqual(['query: A friend told me', 'query: already prefixed', 'query: other prefix'])
    for (const input of inputs) expect(input.split(E5_PREFIX)).toHaveLength(2)
    expect(options).toEqual({ pooling: 'mean', normalize: true })
    expect(vectors.map((v) => [...v])).toEqual([[0, 0.5], [1, 1.5], [2, 2.5]])
  })

  it('does not call the model for an empty list', async () => {
    const model = fakeModel()
    expect(await createEmbedder(model)([])).toEqual([])
    expect(model).not.toHaveBeenCalled()
  })
})

describe('analyseTexts', () => {
  it('embeds only the stories that exist and never sets a review decision', async () => {
    const seen: string[][] = []
    const embed = async (texts: string[]) => {
      seen.push(texts)
      return texts.map(() => at(0))
    }
    const setup = {
      thresholds: THRESHOLDS,
      functionWords: KIK_FUNCTION_WORDS,
      visitReasonPrototypes: {},
      referralPrototypes: {},
      modelRevision: 'test',
    }
    const prototypes = { visitReasons: [{ category: 'food', vector: at(0) }], referrals: [{ category: 'local_guide', vector: at(0) }] }
    const [ok, unformatted] = await analyseTexts(
      ['1) Our guide brought us 2) Come hungry', 'Just a nice day out with the family'],
      setup,
      prototypes,
      embed,
    )

    expect(seen.flat()).toEqual(['Our guide brought us', 'Come hungry', 'Just a nice day out with the family'])
    expect(ok).toMatchObject({ format_ok: true, referral_source_category: 'local_guide', pass_on_category: 'food' })
    expect(unformatted).toMatchObject({ format_ok: false, outgoing_story_text: '', outgoing_embedding: null, pass_on_category: 'unclear' })
    expect(ok).not.toHaveProperty('review_status')
    expect(ok).not.toHaveProperty('confirmed_prior_record_id')
  })
})
