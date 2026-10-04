import { REFERRAL_SOURCES, referralKey, translate, type Lang, type ReferralSource } from '../i18n/strings.ts'
import type { OperatorConfig } from '../operator/config.ts'

export const UNCLEAR = 'unclear'

export const isReferralSource = (id: unknown): id is ReferralSource => REFERRAL_SOURCES.includes(id as ReferralSource)

/** A referral source in the UI language. Anything unknown reads as Unclear. */
export const referralLabel = (id: string | null, lang: Lang): string =>
  translate(lang, referralKey(isReferralSource(id) ? id : UNCLEAR))

/** A visit-reason category in the UI language, from the operator config. Anything unknown reads as Unclear. */
export function reasonLabel(config: OperatorConfig, id: string | null, lang: Lang): string {
  const reason = config.visit_reasons.find((r) => r.id === id) ?? config.visit_reasons.find((r) => r.id === UNCLEAR)!
  return reason.label[lang]
}

/** True for a visit-reason category that says something: known to the config, not missing, not Unclear. */
export const isKnownReason = (config: OperatorConfig, id: string | null): id is string =>
  id !== null && id !== UNCLEAR && config.visit_reasons.some((r) => r.id === id)

export type CategoryMatch = 'same' | 'different' | 'unclear'

/** Whether the new visitor's Came for and the earlier visitor's Would tell friends about are one category. */
export function sameCategoryKind(config: OperatorConfig, came: string | null, tell: string | null): CategoryMatch {
  if (!isKnownReason(config, came) || !isKnownReason(config, tell)) return 'unclear'
  return came === tell ? 'same' : 'different'
}

/**
 * One short line saying the same thing, built only from category labels, so it helps a reader who cannot
 * read the languages the visitors wrote in.
 */
export function sameCategoryLine(config: OperatorConfig, came: string | null, tell: string | null, lang: Lang): string {
  switch (sameCategoryKind(config, came, tell)) {
    case 'unclear':
      return translate(lang, 'compare_unclear')
    case 'same':
      return translate(lang, 'compare_same', { topic: reasonLabel(config, came, lang) })
    case 'different':
      return translate(lang, 'compare_different', {
        came: reasonLabel(config, came, lang),
        tell: reasonLabel(config, tell, lang),
      })
  }
}
