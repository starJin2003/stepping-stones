import type { VisitRecord } from '../db/types.ts'
import { REFERRAL_SOURCES, referralKey, translate, type ReferralSource } from '../i18n/strings.ts'
import { isKnownReason, isReferralSource, reasonLabel, UNCLEAR } from '../lib/categories.ts'
import type { OperatorConfig, SummaryPlaceholder } from '../operator/config.ts'

/** ĩ and ũ are not in the GSM alphabet, so the SMS is UCS-2: one segment holds 70 characters. */
export const SMS_PART_MAX = 70

export type CountedRecord = Pick<
  VisitRecord,
  'record_id' | 'received_at' | 'review_status' | 'synthetic' | 'referral_source_category' | 'pass_on_category' | 'analysis_version'
>

export interface Counts {
  visitors: number
  /** Visits a person linked to an earlier visitor. */
  referred: number
  topReferral: Exclude<ReferralSource, 'unclear'> | null
  /** The visit-reason category most often found in what visitors would tell friends. */
  topPassOn: string | null
  needsReview: number
  /** Whether any counted record is synthetic sample history. */
  includesSample: boolean
  /** Records the model has not read yet, so their categories are missing from the counts. */
  notRead: number
}

/** The most common value, ignoring missing and Unclear. Ties go to whichever comes first in `order`. */
function mostCommon(values: (string | null)[], order: readonly string[]): string | null {
  const counts = new Map<string, number>()
  for (const v of values) if (v !== null && v !== UNCLEAR && order.includes(v)) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: string | null = null
  for (const id of order) if ((counts.get(id) ?? 0) > (best === null ? 0 : counts.get(best)!)) best = id
  return best
}

/** Counts over the given records. Every record on the phone counts, so sample history counts exactly while it is loaded. */
export function countRecords(records: readonly CountedRecord[], config: OperatorConfig): Counts {
  const read = records.filter((r) => r.analysis_version !== null)
  return {
    visitors: records.length,
    referred: records.filter((r) => r.review_status === 'Confirmed').length,
    topReferral: mostCommon(
      read.map((r) => r.referral_source_category),
      REFERRAL_SOURCES,
    ) as Counts['topReferral'],
    topPassOn: mostCommon(
      read.map((r) => r.pass_on_category).filter((id) => isKnownReason(config, id)),
      config.visit_reasons.map((r) => r.id),
    ),
    needsReview: records.filter((r) => r.review_status === 'Pending').length,
    includesSample: records.some((r) => r.synthetic),
    notRead: records.length - read.length,
  }
}

export interface SummaryCounts extends Counts {
  /** True when no summary has been sent from this phone yet. */
  first: boolean
  /** Start of the period: the last summary, or the earliest visit the first time (now, if there are none). */
  since: string
}

/**
 * Counts for the owner's summary. The period is everything received after the last summary was queued,
 * or everything the first time. Items needing review are every record still Pending, whenever it arrived,
 * because an old unchecked message still needs a person.
 */
export function summaryCounts(
  all: readonly CountedRecord[],
  config: OperatorConfig,
  lastSummaryAt: string | null,
  now: Date,
): SummaryCounts {
  const after = lastSummaryAt === null ? null : Date.parse(lastSummaryAt)
  const period = after === null ? [...all] : all.filter((r) => Date.parse(r.received_at) > after)
  const pending = all.filter((r) => r.review_status === 'Pending')
  const counts = countRecords(period, config)
  const earliest = period.map((r) => r.received_at).sort((a, b) => Date.parse(a) - Date.parse(b))[0]
  return {
    ...counts,
    needsReview: pending.length,
    includesSample: counts.includesSample || pending.some((r) => r.synthetic),
    first: lastSummaryAt === null,
    since: lastSummaryAt ?? earliest ?? now.toISOString(),
  }
}

/** "4/10" for 4 October, in the phone's time zone: short, and needs no month names in Gĩkũyũ. */
export function shortDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

export type SummaryValues = Record<SummaryPlaceholder, string>

/** Fills {placeholders} and returns NFC text, so ĩ and ũ are one UCS-2 character each. */
export const fillTemplate = (template: string, values: Partial<SummaryValues>): string =>
  template
    .replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? values[name as keyof SummaryValues]! : match))
    .normalize('NFC')

export interface SummaryPart {
  /** The Gĩkũyũ SMS exactly as it will be sent. */
  text: string
  /** Its English meaning, for the family and judges. Never sent. */
  meaning: string
  /** UCS-2 characters, which is what a segment is counted in. */
  length: number
  fits: boolean
}

/** The values for each template, in Gĩkũyũ for the SMS and in English for its meaning. */
export function summaryValues(config: OperatorConfig, counts: SummaryCounts): { kik: SummaryValues; en: SummaryValues } {
  const { labels } = config.summary_templates
  const numbers = {
    since: shortDate(counts.since),
    visitors: String(counts.visitors),
    referred: String(counts.referred),
    needs_review: String(counts.needsReview),
  }
  const referral = counts.topReferral && isReferralSource(counts.topReferral) ? counts.topReferral : null
  const passOn = isKnownReason(config, counts.topPassOn) ? counts.topPassOn : null
  return {
    kik: {
      ...numbers,
      top_referral: referral ? labels.referral_sources[referral] : labels.none.kik,
      top_pass_on: passOn ? labels.visit_reasons[passOn] : labels.none.kik,
    },
    en: {
      ...numbers,
      top_referral: referral ? translate('en', referralKey(referral)) : labels.none.en,
      top_pass_on: passOn ? reasonLabel(config, passOn, 'en') : labels.none.en,
    },
  }
}

/** The fixed templates filled from counts. Nothing is generated; every word comes from the operator config. */
export function composeSummary(config: OperatorConfig, counts: SummaryCounts): SummaryPart[] {
  const values = summaryValues(config, counts)
  return config.summary_templates.parts.map((part) => {
    const text = fillTemplate(part.kik, values.kik)
    return { text, meaning: fillTemplate(part.en, values.en), length: text.length, fits: text.length <= SMS_PART_MAX }
  })
}
