import { describe, expect, it } from 'vitest'
import exampleGuesthouse from '../../data/operators/example-guesthouse.json'
import noorCoffee from '../../data/operators/noor-coffee.json'
import { analysisPatches } from '../../src/ai/analyze.ts'
import { KIK_FUNCTION_WORDS, THRESHOLDS } from '../../src/ai/config.ts'
import { newRecord, type VisitRecord } from '../../src/db/types.ts'
import { sameCategoryLine } from '../../src/lib/categories.ts'
import { decide, undo, type ReviewStore } from '../../src/lib/review.ts'
import { parseOperatorConfig } from '../../src/operator/config.ts'

const pending = (id: string, candidates: string[] | null = ['earlier-1', 'earlier-2']): VisitRecord => ({
  ...newRecord({
    record_id: id,
    sender_hash: null,
    received_at: '2026-10-01T12:00:00.000Z',
    raw_text_local: '1) heard 2) would tell',
    created_from: 'Paste',
    synthetic: false,
  }),
  candidate_prior_record_ids: candidates,
})

/** An in-memory stand-in for the records table. update() changes only the given fields, as Dexie's does. */
function memoryStore(records: VisitRecord[]) {
  const rows = new Map(records.map((r) => [r.record_id, { ...r }]))
  const store: ReviewStore = {
    get: async (id) => rows.get(id),
    update: async (id, changes) => {
      const row = rows.get(id)
      if (row) rows.set(id, { ...row, ...changes })
      return row ? 1 : 0
    },
  }
  return { store, rows }
}

describe('review decisions', () => {
  it('Same story confirms the link to the candidate shown', async () => {
    const { store, rows } = memoryStore([pending('new')])
    const last = await decide(store, 'new', 'same_story', 'earlier-2')
    expect(rows.get('new')).toMatchObject({ review_status: 'Confirmed', confirmed_prior_record_id: 'earlier-2' })
    expect(last).toMatchObject({ record_id: 'new', decision: 'same_story' })
  })

  it('Same story refuses a record that is not one of its own candidates', async () => {
    const { store, rows } = memoryStore([pending('new')])
    expect(await decide(store, 'new', 'same_story', 'somebody-else')).toBeNull()
    expect(await decide(store, 'new', 'same_story')).toBeNull()
    expect(rows.get('new')).toMatchObject({ review_status: 'Pending', confirmed_prior_record_id: null })
  })

  it('Not linked rejects with no prior record', async () => {
    const { store, rows } = memoryStore([pending('new')])
    await decide(store, 'new', 'not_linked')
    expect(rows.get('new')).toMatchObject({ review_status: 'Rejected', confirmed_prior_record_id: null })
  })

  it('Not linked works without any candidate, for unrecognised or unanalysed messages', async () => {
    const { store, rows } = memoryStore([pending('new', null)])
    await decide(store, 'new', 'not_linked')
    expect(rows.get('new')?.review_status).toBe('Rejected')
  })

  it('Not sure, leave it changes nothing: the record stays Pending', async () => {
    const { store, rows } = memoryStore([pending('new')])
    const before = { ...rows.get('new') }
    const last = await decide(store, 'new', 'leave')
    expect(rows.get('new')).toEqual(before)
    expect(last).toMatchObject({ decision: 'leave' })
  })

  it('does not decide twice: a record that is no longer Pending is left alone', async () => {
    const { store, rows } = memoryStore([pending('new')])
    await decide(store, 'new', 'same_story', 'earlier-1')
    expect(await decide(store, 'new', 'not_linked')).toBeNull()
    expect(rows.get('new')).toMatchObject({ review_status: 'Confirmed', confirmed_prior_record_id: 'earlier-1' })
    expect(await decide(store, 'missing', 'not_linked')).toBeNull()
  })

  it.each(['same_story', 'not_linked', 'leave'] as const)('Undo puts the record back to Pending after %s', async (decision) => {
    const { store, rows } = memoryStore([pending('new')])
    const last = await decide(store, 'new', decision, 'earlier-1')
    expect(await undo(store, last!)).toBe(true)
    expect(rows.get('new')).toMatchObject({ review_status: 'Pending', confirmed_prior_record_id: null })
  })

  it('Undo does nothing if something else changed the record since', async () => {
    const { store, rows } = memoryStore([pending('new')])
    const last = await decide(store, 'new', 'same_story', 'earlier-1')
    rows.set('new', { ...rows.get('new')!, review_status: 'Rejected', confirmed_prior_record_id: null })
    expect(await undo(store, last!)).toBe(false)
    expect(rows.get('new')?.review_status).toBe('Rejected')
  })
})

describe('analysis never overwrites a human decision', () => {
  /** A fake model: every text points the same way, so every earlier visitor is a candidate. */
  const embed = async (texts: string[]) => texts.map(() => new Float32Array([1, 0, 0]))
  const setup = {
    thresholds: THRESHOLDS,
    functionWords: KIK_FUNCTION_WORDS,
    visitReasonPrototypes: {},
    referralPrototypes: {},
    modelRevision: 'test',
  }
  const prototypes = { visitReasons: [{ category: 'food', vector: new Float32Array([1, 0, 0]) }], referrals: [] }

  const at = (day: number) => `2026-09-${String(day).padStart(2, '0')}T12:00:00.000Z`
  const record = (id: string, day: number, extra: Partial<VisitRecord> = {}): VisitRecord => ({
    ...newRecord({
      record_id: id,
      sender_hash: null,
      received_at: at(day),
      raw_text_local: `1) heard about it ${id} 2) would tell friends ${id}`,
      created_from: 'Seed',
      synthetic: true,
    }),
    ...extra,
  })

  it('analysis patches never contain review_status or confirmed_prior_record_id', async () => {
    const all = [
      record('a', 1),
      record('b', 2, { review_status: 'Confirmed', confirmed_prior_record_id: 'a' }),
      record('c', 3, { review_status: 'Rejected' }),
      record('d', 4),
    ]
    const patches = await analysisPatches(all, setup, prototypes, embed, 'v2')
    expect([...patches.keys()].sort()).toEqual(['a', 'b', 'c', 'd'])
    for (const patch of patches.values()) {
      expect(patch).not.toHaveProperty('review_status')
      expect(patch).not.toHaveProperty('confirmed_prior_record_id')
      expect(patch.analysis_version).toBe('v2')
    }
  })

  it('re-running analysis keeps every decision, including one made while it was running', async () => {
    const all = [
      record('a', 1, { analysis_version: 'v1' }),
      record('b', 2, { review_status: 'Confirmed', confirmed_prior_record_id: 'a', analysis_version: 'v1' }),
      record('c', 3, { review_status: 'Rejected', analysis_version: 'v1' }),
      // Still Pending, with candidates from the earlier analysis.
      record('d', 4, { analysis_version: 'v1', candidate_prior_record_ids: ['c', 'b', 'a'] }),
    ]
    const patches = await analysisPatches(all, setup, prototypes, embed, 'v2')
    // Meanwhile a person links d, which this analysis read as Pending.
    const { store, rows } = memoryStore(all)
    expect(await decide(store, 'd', 'same_story', 'c')).not.toBeNull()

    // The runner writes each patch with a partial update.
    for (const [id, patch] of patches) rows.set(id, { ...rows.get(id)!, ...patch })

    expect(rows.get('b')).toMatchObject({ review_status: 'Confirmed', confirmed_prior_record_id: 'a' })
    expect(rows.get('c')).toMatchObject({ review_status: 'Rejected', confirmed_prior_record_id: null })
    expect(rows.get('d')).toMatchObject({ review_status: 'Confirmed', confirmed_prior_record_id: 'c' })
    expect(rows.get('d')?.analysis_version).toBe('v2')
  })

  it('patches only out-of-date records and records still Pending; an up-to-date decision gets none', async () => {
    const all = [record('a', 1, { analysis_version: 'v2' }), record('b', 2, { review_status: 'Rejected', analysis_version: 'v2' })]
    const patches = await analysisPatches(all, setup, prototypes, embed, 'v2')
    expect([...patches.keys()]).toEqual(['a'])
  })
})

describe('same-category line', () => {
  const noor = parseOperatorConfig(noorCoffee)

  it('says when both stories fall in the same category', () => {
    expect(sameCategoryLine(noor, 'food', 'food', 'en')).toBe('Both stories are about the same thing: Food.')
    expect(sameCategoryLine(noor, 'food', 'food', 'sw')).toBe('Hadithi zote mbili zinahusu jambo moja: Chakula.')
  })

  it('names both categories when they differ, the new visitor first', () => {
    expect(sameCategoryLine(noor, 'farm_tour', 'food', 'en')).toBe('The stories are about different things: Farm tour and Food.')
    expect(sameCategoryLine(noor, 'farm_tour', 'food', 'sw')).toBe('Hadithi zinahusu mambo tofauti: Ziara ya shamba na Chakula.')
  })

  it.each([
    ['unclear', 'food'],
    ['food', 'unclear'],
    [null, 'food'],
    ['food', null],
    ['unclear', 'unclear'],
    ['not-a-category', 'not-a-category'],
  ])('is plainly unsure when a category is missing or Unclear (%s, %s)', (came, tell) => {
    expect(sameCategoryLine(noor, came, tell, 'en')).toBe('Not clear if the stories are about the same thing.')
  })

  it("uses only the operator config's labels", () => {
    const guesthouse = parseOperatorConfig(exampleGuesthouse)
    expect(sameCategoryLine(guesthouse, 'rooms', 'rooms', 'en')).toBe('Both stories are about the same thing: Rooms.')
    expect(sameCategoryLine(guesthouse, 'farm_tour', 'farm_tour', 'en')).toBe('Not clear if the stories are about the same thing.')
  })
})
