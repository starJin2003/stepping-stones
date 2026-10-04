import { describe, expect, it } from 'vitest'
import exampleGuesthouse from '../../data/operators/example-guesthouse.json'
import noorCoffee from '../../data/operators/noor-coffee.json'
import type { ReviewStatus } from '../../src/db/types.ts'
import { REFERRAL_SOURCES } from '../../src/i18n/strings.ts'
import { parseOperatorConfig, SUMMARY_PLACEHOLDERS, type OperatorConfig } from '../../src/operator/config.ts'
import {
  composeSummary,
  countRecords,
  fillTemplate,
  shortDate,
  SMS_PART_MAX,
  summaryCounts,
  type CountedRecord,
  type SummaryValues,
} from '../../src/summary/summary.ts'

const CONFIGS: [string, OperatorConfig][] = [
  ['noor-coffee', parseOperatorConfig(noorCoffee)],
  ['example-guesthouse', parseOperatorConfig(exampleGuesthouse)],
]
const noor = CONFIGS[0][1]

// Noon UTC mid-month, so the local date is the same wherever the tests run.
const at = (date: string) => `2026-${date}T12:00:00.000Z`

function visit(id: string, date: string, extra: Partial<CountedRecord> = {}): CountedRecord {
  return {
    record_id: id,
    received_at: at(date),
    review_status: 'Rejected' as ReviewStatus,
    synthetic: false,
    referral_source_category: 'unclear',
    pass_on_category: 'unclear',
    analysis_version: 'v1',
    ...extra,
  }
}

describe('countRecords', () => {
  const records = [
    visit('a', '08-10', { referral_source_category: 'guesthouse_guest', pass_on_category: 'food' }),
    visit('b', '08-12', { review_status: 'Confirmed', referral_source_category: 'guesthouse_guest', pass_on_category: 'food' }),
    visit('c', '08-14', { review_status: 'Confirmed', referral_source_category: 'local_guide', pass_on_category: 'farm_tour' }),
    visit('d', '08-15', { review_status: 'Pending', referral_source_category: 'unclear', pass_on_category: 'unclear' }),
    visit('e', '08-16', { review_status: 'Pending', referral_source_category: null, pass_on_category: null, analysis_version: null }),
  ]

  it('counts visitors, referred visits, items to review, and the most common categories', () => {
    expect(countRecords(records, noor)).toEqual({
      visitors: 5,
      referred: 2,
      topReferral: 'guesthouse_guest',
      topPassOn: 'food',
      needsReview: 2,
      includesSample: false,
      notRead: 1,
    })
  })

  it('never picks Unclear as the most common category, and has none when nothing is known', () => {
    const unclear = [visit('a', '08-10'), visit('b', '08-11'), visit('c', '08-12', { pass_on_category: 'food' })]
    expect(countRecords(unclear, noor)).toMatchObject({ topReferral: null, topPassOn: 'food' })
    expect(countRecords([], noor)).toMatchObject({ visitors: 0, topReferral: null, topPassOn: null })
  })

  it('breaks ties by the order of the categories, so the answer is stable', () => {
    const tied = [
      visit('a', '08-10', { referral_source_category: 'local_guide', pass_on_category: 'food' }),
      visit('b', '08-11', { referral_source_category: 'friend_family', pass_on_category: 'coffee_experience' }),
    ]
    expect(countRecords(tied, noor)).toMatchObject({ topReferral: 'friend_family', topPassOn: 'coffee_experience' })
  })

  it('says when synthetic sample history is part of the count', () => {
    expect(countRecords([visit('s', '08-10', { synthetic: true })], noor).includesSample).toBe(true)
  })
})

describe('summaryCounts: the period', () => {
  const now = new Date(at('10-04'))
  const records = [
    visit('june', '06-14', { synthetic: true, review_status: 'Confirmed', referral_source_category: 'guesthouse_guest' }),
    visit('sept', '09-20', { review_status: 'Pending' }),
    visit('oct-1', '10-02', { review_status: 'Confirmed', referral_source_category: 'friend_family' }),
    visit('oct-2', '10-03', { referral_source_category: 'friend_family', pass_on_category: 'farm_tour' }),
  ]

  it('the first time covers everything, from the earliest visit', () => {
    const counts = summaryCounts(records, noor, null, now)
    expect(counts).toMatchObject({ first: true, since: at('06-14'), visitors: 4, referred: 2, needsReview: 1, includesSample: true })
  })

  it('after that, covers only visits received since the last summary', () => {
    const counts = summaryCounts(records, noor, at('10-01'), now)
    expect(counts).toMatchObject({
      first: false,
      since: at('10-01'),
      visitors: 2,
      referred: 1,
      topReferral: 'friend_family',
      topPassOn: 'farm_tour',
    })
  })

  it('still counts every message waiting for review, whenever it arrived', () => {
    expect(summaryCounts(records, noor, at('10-01'), now).needsReview).toBe(1)
  })

  it('counts sample history only while it is loaded, and says so', () => {
    const real = records.filter((r) => !r.synthetic)
    expect(summaryCounts(records, noor, null, now)).toMatchObject({ visitors: 4, includesSample: true })
    expect(summaryCounts(real, noor, null, now)).toMatchObject({ visitors: 3, includesSample: false, since: at('09-20') })
    // Sample visits from before the last summary are outside the period.
    expect(summaryCounts(records, noor, at('10-01'), now).includesSample).toBe(false)
  })

  it('with nothing on the phone, the period starts now and everything is zero', () => {
    const counts = summaryCounts([], noor, null, now)
    expect(counts).toMatchObject({ since: now.toISOString(), visitors: 0, referred: 0, needsReview: 0 })
  })
})

describe('composeSummary', () => {
  it('fills the fixed Gĩkũyũ templates from counts, with an English meaning for each part', () => {
    const counts = summaryCounts(
      [
        visit('a', '10-02', { review_status: 'Confirmed', referral_source_category: 'guesthouse_guest', pass_on_category: 'coffee_experience' }),
        visit('b', '10-03', { review_status: 'Pending', referral_source_category: 'guesthouse_guest', pass_on_category: 'food' }),
        visit('c', '10-03', { pass_on_category: 'coffee_experience' }),
      ],
      noor,
      at('10-01'),
      new Date(at('10-04')),
    )
    const parts = composeSummary(noor, counts)
    expect(parts.map((p) => p.text)).toEqual([
      'Noor, kuuma 1/10, ageni: 3. Mookire nĩ ũndũ wa ageni a mbere: 1.',
      'Maiguire ũhoro mũno kuuma kũrĩ: Ageni a nyũmba ya ageni.',
      'Mangĩĩra arata mũno ũhoro wa: Kahũa.',
      'Ndũmĩrĩri itanathuthurio thimũ-inĩ: 1.',
    ])
    expect(parts.map((p) => p.meaning)).toEqual([
      'Noor, since 1/10, visitors: 3. Came because of earlier visitors: 1.',
      'Most often heard about it from: Guesthouse guest.',
      'Most would tell friends about: Coffee experience.',
      'Messages not yet checked on the phone: 1.',
    ])
    for (const part of parts) expect(part).toMatchObject({ length: part.text.length, fits: true })
  })

  it('says none yet when no category stands out', () => {
    const parts = composeSummary(noor, summaryCounts([visit('a', '10-02')], noor, null, new Date(at('10-04'))))
    expect(parts[1].text).toBe('Maiguire ũhoro mũno kuuma kũrĩ: gũtirĩ.')
    expect(parts[1].meaning).toBe('Most often heard about it from: none yet.')
  })

  it('writes the date as day/month', () => {
    expect(shortDate(at('06-14'))).toBe('14/6')
    expect(shortDate(at('12-30'))).toBe('30/12')
  })
})

describe('summary templates fit one SMS each', () => {
  const longest = (labels: string[]) => labels.reduce((a, b) => (b.length > a.length ? b : a))

  it.each(CONFIGS)('%s: every part is at most 70 UCS-2 characters with worst-case values', (_id, config) => {
    const { labels, parts } = config.summary_templates
    const worst: SummaryValues = {
      since: '30/12',
      visitors: '99',
      referred: '99',
      needs_review: '99',
      top_referral: longest([...Object.values(labels.referral_sources), labels.none.kik]),
      top_pass_on: longest([...Object.values(labels.visit_reasons), labels.none.kik]),
    }
    for (const part of parts) {
      const text = fillTemplate(part.kik, worst)
      expect(text, text).not.toMatch(/\{\w+\}/)
      expect(text.length, `${text} (${text.length})`).toBeLessThanOrEqual(SMS_PART_MAX)
      // ĩ and ũ must be single characters, or each would cost two.
      expect(text).toBe(text.normalize('NFC'))
    }
  })

  it.each(CONFIGS)('%s: has a Gĩkũyũ label for every category it can name', (_id, config) => {
    const { labels } = config.summary_templates
    for (const source of REFERRAL_SOURCES.filter((s) => s !== 'unclear')) expect(labels.referral_sources[source]).toBeTruthy()
    for (const reason of config.visit_reasons.filter((r) => r.id !== 'unclear')) expect(labels.visit_reasons[reason.id]).toBeTruthy()
    // Gĩkũyũ uses ĩ and ũ; at least some labels and templates should carry them.
    expect(JSON.stringify(config.summary_templates)).toMatch(/[ĩũ]/)
  })

  it.each(CONFIGS)('%s: is marked machine translation, native-speaker validation pending', (_id, config) => {
    expect(config.summary_templates.status).toMatch(/machine translation, native-speaker validation pending/)
  })

  it.each(CONFIGS)('%s: covers every summary fact', (_id, config) => {
    const used = new Set(config.summary_templates.parts.flatMap((p) => [...p.kik.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))
    expect([...used].sort()).toEqual([...SUMMARY_PLACEHOLDERS].sort())
  })
})
