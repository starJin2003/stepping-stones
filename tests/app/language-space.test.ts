import { describe, expect, it } from 'vitest'
import dev from '../../data/eval/dev.synthetic.json'
import test from '../../data/eval/test.synthetic.json'
import languageMeans from '../../data/ai/language-means.json'
import noorCoffee from '../../data/operators/noor-coffee.json'
import seed from '../../data/seed/noor-coffee.synthetic.json'
import { THRESHOLDS } from '../../src/ai/config.ts'
import { center, marginK, neighbourhood, ratioMargin } from '../../src/ai/language-space.ts'
import { buildScorer, findMatch, type MatchableRecord } from '../../src/ai/match.ts'
import { REFERRAL_SOURCES } from '../../src/i18n/strings.ts'

const v = (...xs: number[]) => Float32Array.from(xs)
const norm = (x: Float32Array) => Math.sqrt(x.reduce((s, a) => s + a * a, 0))

describe('centering by language', () => {
  const means = { English: [0.5, 0, 0], Kiswahili: [0, 0.5, 0] }

  it("subtracts the language's mean and renormalizes", () => {
    const out = center(v(0.8, 0.6, 0), 'English', means)
    // (0.8 - 0.5, 0.6) = (0.3, 0.6), renormalized.
    expect(Array.from(out).map((x) => Number(x.toFixed(4)))).toEqual([0.4472, 0.8944, 0])
    expect(norm(out)).toBeCloseTo(1)
  })

  it('uses the average of all means for Unknown', () => {
    const out = center(v(0.25, 0.25, 1), 'Unknown', means)
    // The average mean is (0.25, 0.25, 0), so only the third direction is left.
    expect(Array.from(out).map((x) => Number(x.toFixed(4)))).toEqual([0, 0, 1])
  })

  it('leaves vectors alone without means', () => {
    const x = v(1, 0, 0)
    expect(center(x, 'English', {})).toBe(x)
  })

  it('has a mean for each FLORES language, built from dev, with source and license', () => {
    expect(Object.keys(languageMeans.means).sort()).toEqual(['English', 'French', 'German', 'Gikuyu', 'Kiswahili'])
    for (const mean of Object.values(languageMeans.means)) expect(mean).toHaveLength(384)
    expect(languageMeans.license).toBe('CC BY-SA 4.0')
    expect(languageMeans.split_used).toMatch(/^dev only/)
  })
})

describe('ratio margin', () => {
  it('k is 4, but never more than half a small pool', () => {
    expect([1, 2, 3, 5, 8, 9, 40].map((n) => marginK(n, 4))).toEqual([1, 1, 1, 2, 4, 4, 4])
  })

  it('divides the cosine by the average closeness of both sides to their neighbours', () => {
    expect(ratioMargin(0.9, 0.6, 0.9)).toBeCloseTo(1.2)
    expect(neighbourhood(v(1, 0), [v(1, 0), v(0, 1), v(0.6, 0.8), v(-1, 0)], 4)).toBeCloseTo((1 + 0.6) / 2)
  })

  it('stops a would-tell story that is close to every heard story from winning by default', () => {
    // The hub's would-tell sits near every heard story; the source's would-tell is close to just this one.
    const at = (d: number) => v(Math.cos((d * Math.PI) / 180), Math.sin((d * Math.PI) / 180))
    const rec = (id: string, day: number, heard: number | null, tell: number | null): MatchableRecord => ({
      record_id: id,
      received_at: `2026-09-${String(day).padStart(2, '0')}T12:00:00.000Z`,
      format_ok: true,
      incoming_embedding: heard === null ? null : at(heard),
      outgoing_embedding: tell === null ? null : at(tell),
      referral_source_category: 'other',
      detected_language: null,
    })
    // Plain cosine to the new heard story (20 degrees): hub 0.996, source 0.966. The hub is also close to x and y.
    const records = [rec('hub', 1, 200, 25), rec('source', 2, 210, 5), rec('x', 3, 60, null), rec('y', 4, 80, null), rec('new', 10, 20, null)]
    const plain = findMatch(records[4], records, THRESHOLDS.match)
    expect(plain.candidate_prior_record_ids[0]).toBe('hub')
    const margin = buildScorer(records, { matching: { center_by_language: false, ratio_margin: true, margin_k: 4 }, means: {} })
    expect(findMatch(records[4], records, THRESHOLDS.match, margin).candidate_prior_record_ids[0]).toBe('source')
  })
})

describe('synthetic eval sets', () => {
  const reasons = new Set(noorCoffee.visit_reasons.map((r) => r.id))
  const protectedTexts = [...seed.demo_sms, ...seed.records.map((r) => r.raw_text_local)]

  it.each([
    ['dev', dev],
    ['test', test],
  ])('%s: about 40 synthetic records with valid gold labels and earlier links only', (split, set) => {
    expect(set.synthetic).toBe(true)
    expect(set.split).toBe(split)
    expect(set.records.length).toBeGreaterThanOrEqual(35)
    expect(set.records.length).toBeLessThanOrEqual(45)
    const seen = new Map<string, string>()
    for (const r of set.records) {
      expect(r.synthetic).toBe(true)
      expect(['en', 'de', 'fr', 'sw']).toContain(r.language)
      expect([...REFERRAL_SOURCES]).toContain(r.gold.referral)
      for (const field of ['came_for', 'would_tell'] as const) {
        if (r.gold[field] !== null) expect(reasons.has(r.gold[field]!), `${r.record_id} ${field}`).toBe(true)
      }
      if (r.gold.link) {
        expect(seen.has(r.gold.link), `${r.record_id} links to an earlier record`).toBe(true)
        expect(seen.get(r.gold.link)! < r.received_at).toBe(true)
      }
      if (r.gold.kind === 'ambiguous' || r.gold.kind === 'format' || r.gold.kind === 'start') expect(r.gold.link).toBeNull()
      seen.set(r.record_id, r.received_at)
    }
    const kinds = new Set(set.records.map((r) => r.gold.kind))
    expect([...kinds].sort()).toEqual(['ambiguous', 'format', 'link', 'near_miss', 'start'])
  })

  it('keeps the demo SMS and the sample history out of both sets', () => {
    for (const r of [...dev.records, ...test.records]) for (const text of protectedTexts) expect(r.raw_text).not.toBe(text)
  })
})
