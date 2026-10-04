import { describe, expect, it } from 'vitest'
import { reviewWords, sourceWords, visitorLabels } from '../../src/lib/visitors.ts'

// Mid-month noon UTC, so the month is the same in any time zone the tests run in.
const at = (day: string) => `2026-${day}T12:00:00.000Z`

const RECORDS = [
  { record_id: 'c', received_at: at('08-20') },
  { record_id: 'a', received_at: at('08-10') },
  { record_id: 'x', received_at: at('07-15') },
  { record_id: 'b', received_at: at('08-15') },
]

describe('visitorLabels', () => {
  it('numbers visitors by order within their month', () => {
    const labels = visitorLabels(RECORDS, 'en')
    expect(labels.get('a')).toBe('Visitor 1, Aug 2026')
    expect(labels.get('b')).toBe('Visitor 2, Aug 2026')
    expect(labels.get('c')).toBe('Visitor 3, Aug 2026')
    expect(labels.get('x')).toBe('Visitor 1, Jul 2026')
  })

  it('uses Kiswahili month names from Intl', () => {
    const labels = visitorLabels(RECORDS, 'sw')
    expect(labels.get('c')).toBe('Mgeni 3, Ago 2026')
    expect(labels.get('x')).toBe('Mgeni 1, Jul 2026')
    expect(visitorLabels([{ record_id: 's', received_at: at('09-14') }], 'en').get('s')).toBe('Visitor 1, Sep 2026')
  })

  it('has no middle dots or names', () => {
    for (const lang of ['sw', 'en'] as const) {
      for (const label of visitorLabels(RECORDS, lang).values()) expect(label).not.toContain('·')
    }
  })
})

describe('words', () => {
  const labels = new Map([['prior', 'Visitor 2, Jul 2026']])

  it('names the source in words', () => {
    expect(sourceWords({ created_from: 'SMS' }, 'en')).toBe('Text message')
    expect(sourceWords({ created_from: 'Paste' }, 'en')).toBe('Pasted')
    expect(sourceWords({ created_from: 'Seed' }, 'en')).toBe('Sample, synthetic')
    expect(sourceWords({ created_from: 'Seed' }, 'sw')).toBe('Mfano, wa kubuni')
  })

  it('names the review status in words', () => {
    expect(reviewWords({ review_status: 'Pending', confirmed_prior_record_id: null }, labels, 'en')).toBe('To check')
    expect(reviewWords({ review_status: 'Rejected', confirmed_prior_record_id: null }, labels, 'en')).toBe('Not linked')
    expect(reviewWords({ review_status: 'Confirmed', confirmed_prior_record_id: 'prior' }, labels, 'en')).toBe(
      'Linked to Visitor 2, Jul 2026',
    )
    expect(reviewWords({ review_status: 'Confirmed', confirmed_prior_record_id: 'gone' }, labels, 'sw')).toBe(
      'Umeunganishwa na mgeni wa awali',
    )
  })
})
