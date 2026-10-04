import type { CreatedFrom, VisitRecord } from '../db/types.ts'
import { DATE_LOCALE, translate, type Lang, type StringKey } from '../i18n/strings.ts'

/**
 * "Visitor 3, Aug 2026" / "Mgeni 3, Ago 2026": the number is the order within that month by received_at,
 * in the phone's local time. Month names come from Intl. Visitors are never shown by name.
 */
export function visitorLabels(
  records: ReadonlyArray<Pick<VisitRecord, 'record_id' | 'received_at'>>,
  lang: Lang,
): Map<string, string> {
  const monthName = new Intl.DateTimeFormat(DATE_LOCALE[lang], { month: 'short', year: 'numeric' })
  const sorted = [...records].sort(
    (a, b) => Date.parse(a.received_at) - Date.parse(b.received_at) || a.record_id.localeCompare(b.record_id),
  )
  const labels = new Map<string, string>()
  const perMonth = new Map<string, number>()
  for (const r of sorted) {
    const date = new Date(r.received_at)
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`
    const n = (perMonth.get(monthKey) ?? 0) + 1
    perMonth.set(monthKey, n)
    labels.set(r.record_id, translate(lang, 'visitor', { n, month: monthName.format(date) }))
  }
  return labels
}

const SOURCE_KEYS: Record<CreatedFrom, StringKey> = {
  SMS: 'source_sms',
  Paste: 'source_paste',
  Seed: 'source_seed',
}

export const sourceWords = (r: Pick<VisitRecord, 'created_from'>, lang: Lang): string =>
  translate(lang, SOURCE_KEYS[r.created_from])

export function reviewWords(
  r: Pick<VisitRecord, 'review_status' | 'confirmed_prior_record_id'>,
  labels: Map<string, string>,
  lang: Lang,
): string {
  switch (r.review_status) {
    case 'Pending':
      return translate(lang, 'status_pending')
    case 'Rejected':
      return translate(lang, 'status_rejected')
    case 'Confirmed': {
      const prior = r.confirmed_prior_record_id && labels.get(r.confirmed_prior_record_id)
      return prior ? translate(lang, 'status_confirmed', { visitor: prior }) : translate(lang, 'status_confirmed_unknown')
    }
  }
}
