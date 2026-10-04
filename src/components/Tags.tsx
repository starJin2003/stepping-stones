import { LANGUAGES, type Language } from '../ai/config.ts'
import type { VisitRecord } from '../db/types.ts'
import { useLanguage } from '../i18n/language.tsx'
import { isKnownReason, isReferralSource, reasonLabel, referralLabel, UNCLEAR } from '../lib/categories.ts'
import { operator } from '../operator/active.ts'

/** A label and value tag. An Unclear value is drawn in Stone grey with a dashed edge, and still says Unclear. */
export function Tag({ label, value, unclear = false }: { label: string; value: string; unclear?: boolean }) {
  return (
    <span className={unclear ? 'tag tag-unclear' : 'tag'}>
      <span className="tag-label">{label}</span> <span className="tag-value">{value}</span>
    </span>
  )
}

export const isUnclearReferral = (id: string | null) => !isReferralSource(id) || id === UNCLEAR

/** "Heard from" as one tag. A stone leaves it out when it says nothing (hideUnclear). */
export function HeardFromTag({ record, hideUnclear = false }: { record: VisitRecord; hideUnclear?: boolean }) {
  const { lang, t } = useLanguage()
  const id = record.referral_source_category
  if (!record.analysis_version || (hideUnclear && isUnclearReferral(id))) return null
  return <Tag label={t('tag_heard')} value={referralLabel(id, lang)} unclear={isUnclearReferral(id)} />
}

/** The AI reading under a message as four compact tags. Words only, never scores. */
export function ReadingTags({ record }: { record: VisitRecord }) {
  const { lang, t } = useLanguage()
  if (!record.analysis_version) return null

  const reason = (id: string | null) => ({ value: reasonLabel(operator, id, lang), unclear: !isKnownReason(operator, id) })
  const language: Language = LANGUAGES.includes(record.detected_language as Language)
    ? (record.detected_language as Language)
    : 'Unknown'

  return (
    <ul className="tags">
      <li>
        <HeardFromTag record={record} />
      </li>
      <li>
        <Tag label={t('tag_came')} {...reason(record.visit_reason_category)} />
      </li>
      {record.format_ok && (
        <li>
          <Tag label={t('tag_tell')} {...reason(record.pass_on_category)} />
        </li>
      )}
      <li>
        <Tag label={t('tag_language')} value={t(`detected_${language}`)} unclear={language === 'Unknown'} />
      </li>
    </ul>
  )
}
