import { describe, expect, it } from 'vitest'
import { reviewWords, sourceWords, visitorLabels } from '../../src/lib/visitors.ts'

// Mid-month noon UTC, so the month is the same in any time zone the tests run in.
const at = (day: string) => `2026-${day}T12:00:00.000Z`

describe('visitorLabels', () => {
  it('numbers visitors by order within their month', () => {
    const labels = visitorLabels([
      { record_id: 'c', received_at: at('08-20') },
      { record_id: 'a', received_at: at('08-10') },
      { record_id: 'x', received_at: at('07-15') },
      { record_id: 'b', received_at: at('08-15') },
    ])
    expect(labels.get('a')).toBe('Visitor 1, Aug 2026')
    expect(labels.get('b')).toBe('Visitor 2, Aug 2026')
    expect(labels.get('c')).toBe('Visitor 3, Aug 2026')
    expect(labels.get('x')).toBe('Visitor 1, Jul 2026')
  })

  it('has no middle dots or names', () => {
    const [label] = visitorLabels([{ record_id: 'a', received_at: at('09-14') }]).values()
    expect(label).toBe('Visitor 1, Sep 2026')
    expect(label).not.toContain('·')
  })
})

describe('words', () => {
  const labels = new Map([['prior', 'Visitor 2, Jul 2026']])

  it('names the source in words', () => {
    expect(sourceWords({ created_from: 'SMS' })).toBe('Text message')
    expect(sourceWords({ created_from: 'Paste' })).toBe('Pasted')
    expect(sourceWords({ created_from: 'Seed' })).toBe('Sample, synthetic')
  })

  it('names the review status in words', () => {
    expect(reviewWords({ review_status: 'Pending', confirmed_prior_record_id: null }, labels)).toBe('Needs review')
    expect(reviewWords({ review_status: 'Rejected', confirmed_prior_record_id: null }, labels)).toBe('Not linked')
    expect(reviewWords({ review_status: 'Confirmed', confirmed_prior_record_id: 'prior' }, labels)).toBe(
      'Linked to Visitor 2, Jul 2026',
    )
  })
})
