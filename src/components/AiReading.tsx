import { LANGUAGES, type Language } from '../ai/config.ts'
import type { VisitRecord } from '../db/types.ts'
import { useLanguage } from '../i18n/language.tsx'
import { reasonLabel, referralLabel } from '../lib/categories.ts'
import { operator } from '../operator/active.ts'

/** The AI reading under a message, as short plain lines in the UI language. Words only, never scores. */
export function AiReading({ record, formatNote = true }: { record: VisitRecord; formatNote?: boolean }) {
  const { lang, t } = useLanguage()
  if (!record.analysis_version) return null

  const reason = (id: string | null) => reasonLabel(operator, id, lang)
  const language: Language = LANGUAGES.includes(record.detected_language as Language)
    ? (record.detected_language as Language)
    : 'Unknown'

  return (
    <ul className="reading">
      {formatNote && !record.format_ok && <li>{t('reading_no_format')}</li>}
      <li>{t('reading_heard', { value: referralLabel(record.referral_source_category, lang) })}</li>
      <li>{t('reading_came', { value: reason(record.visit_reason_category) })}</li>
      {record.format_ok && <li>{t('reading_tell', { value: reason(record.pass_on_category) })}</li>}
      <li>{t('reading_language', { value: t(`detected_${language}`) })}</li>
    </ul>
  )
}
