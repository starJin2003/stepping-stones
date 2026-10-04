import { newRecord, type ReviewStatus, type VisitRecord } from './types.ts'

export interface SampleHistory {
  records: VisitRecord[]
  demo_sms: string[]
  demo_intended_match: string
}

const REVIEW_STATUSES: ReviewStatus[] = ['Pending', 'Confirmed', 'Rejected']

/** Validates a synthetic seed file and turns it into device records. Throws on anything not clearly synthetic. */
export function parseSampleHistory(raw: unknown): SampleHistory {
  const fail = (problem: string): never => {
    throw new Error(`Invalid sample history: ${problem}`)
  }
  const file = raw as Record<string, unknown> | null
  if (file?.synthetic !== true) fail('file must be marked synthetic')
  if (!Array.isArray(file?.records)) fail('records missing')

  const seen = new Set<string>()
  const records = (file!.records as Record<string, unknown>[]).map((r, i) => {
    const id = r.record_id
    if (typeof id !== 'string' || seen.has(id)) fail(`record ${i} has a missing or duplicate record_id`)
    if (r.synthetic !== true || r.created_from !== 'Seed') fail(`${id} must be synthetic and created_from Seed`)
    if (typeof r.raw_text_local !== 'string' || typeof r.sender_hash !== 'string') fail(`${id} text or sender`)
    if (typeof r.received_at !== 'string' || Number.isNaN(Date.parse(r.received_at))) fail(`${id} received_at`)
    if (!REVIEW_STATUSES.includes(r.review_status as ReviewStatus)) fail(`${id} review_status`)
    const prior = r.confirmed_prior_record_id ?? null
    if (prior !== null && !seen.has(prior as string)) fail(`${id} links to a record that is not earlier in the file`)
    if ((r.review_status === 'Confirmed') !== (prior !== null)) fail(`${id} Confirmed needs exactly one prior record`)
    seen.add(id as string)

    return newRecord({
      record_id: id as string,
      sender_hash: r.sender_hash as string,
      received_at: r.received_at as string,
      raw_text_local: r.raw_text_local as string,
      review_status: r.review_status as ReviewStatus,
      confirmed_prior_record_id: prior as string | null,
      created_from: 'Seed',
      synthetic: true,
    })
  })

  const demoSms = file!.demo_sms
  if (!Array.isArray(demoSms) || !demoSms.every((t) => typeof t === 'string')) fail('demo_sms')
  if (typeof file!.demo_intended_match !== 'string' || !seen.has(file!.demo_intended_match)) fail('demo_intended_match')

  return { records, demo_sms: demoSms as string[], demo_intended_match: file!.demo_intended_match as string }
}
