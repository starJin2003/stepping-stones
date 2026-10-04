import type { CreatedFrom, VisitRecord } from '../db/types.ts'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * "Visitor 3, Aug 2026": the number is the order within that month by received_at, in the phone's local time.
 * Visitors are never shown by name.
 */
export function visitorLabels(records: ReadonlyArray<Pick<VisitRecord, 'record_id' | 'received_at'>>): Map<string, string> {
  const sorted = [...records].sort(
    (a, b) => Date.parse(a.received_at) - Date.parse(b.received_at) || a.record_id.localeCompare(b.record_id),
  )
  const labels = new Map<string, string>()
  const perMonth = new Map<string, number>()
  for (const r of sorted) {
    const date = new Date(r.received_at)
    const month = `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
    const n = (perMonth.get(month) ?? 0) + 1
    perMonth.set(month, n)
    labels.set(r.record_id, `Visitor ${n}, ${month}`)
  }
  return labels
}

const SOURCE_WORDS: Record<CreatedFrom, string> = {
  SMS: 'Text message',
  Paste: 'Pasted',
  Seed: 'Sample, synthetic',
}

export const sourceWords = (r: Pick<VisitRecord, 'created_from'>): string => SOURCE_WORDS[r.created_from]

export function reviewWords(
  r: Pick<VisitRecord, 'review_status' | 'confirmed_prior_record_id'>,
  labels: Map<string, string>,
): string {
  switch (r.review_status) {
    case 'Pending':
      return 'Needs review'
    case 'Rejected':
      return 'Not linked'
    case 'Confirmed': {
      const prior = r.confirmed_prior_record_id && labels.get(r.confirmed_prior_record_id)
      return prior ? `Linked to ${prior}` : 'Linked to an earlier visitor'
    }
  }
}
