import { describe, expect, it } from 'vitest'
import seedFile from '../../data/seed/noor-coffee.synthetic.json'
import { parseSampleHistory } from '../../src/db/seed.ts'

describe('noor-coffee sample history', () => {
  const seed = parseSampleHistory(seedFile)
  const byId = new Map(seed.records.map((r) => [r.record_id, r]))

  it('has 10 to 12 synthetic Seed visits between June and September 2026', () => {
    expect(seed.records.length).toBeGreaterThanOrEqual(10)
    expect(seed.records.length).toBeLessThanOrEqual(12)
    for (const r of seed.records) {
      expect(r).toMatchObject({ synthetic: true, created_from: 'Seed' })
      expect(r.received_at >= '2026-06-01' && r.received_at < '2026-10-01').toBe(true)
      expect(r.raw_text_local).toMatch(/^1\) .+ 2\) .+/)
    }
  })

  it('records a chain of at least three confirmed links, each to an earlier visit', () => {
    let longest = 0
    for (const r of seed.records) {
      let links = 0
      let current = r
      while (current.confirmed_prior_record_id) {
        const prior = byId.get(current.confirmed_prior_record_id)!
        expect(prior.received_at < current.received_at).toBe(true)
        current = prior
        links++
      }
      longest = Math.max(longest, links)
    }
    expect(longest).toBeGreaterThanOrEqual(3)
    expect(longest).toBeLessThanOrEqual(4)
  })

  it('includes visits a person decided not to link', () => {
    expect(seed.records.some((r) => r.review_status === 'Rejected')).toBe(true)
  })

  it('has two English demo texts in the two-answer format, aimed at a seed visit', () => {
    expect(seed.demo_sms).toHaveLength(2)
    for (const text of seed.demo_sms) expect(text).toMatch(/^1\) .+ 2\) .+/)
    expect(byId.has(seed.demo_intended_match)).toBe(true)
  })

  it('rejects a file that is not marked synthetic', () => {
    expect(() => parseSampleHistory({ ...seedFile, synthetic: false })).toThrow(/synthetic/)
    const unmarked = { ...seedFile, records: [{ ...seedFile.records[0], synthetic: false }] }
    expect(() => parseSampleHistory(unmarked)).toThrow(/synthetic/)
  })
})
