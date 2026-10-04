import { useLanguage } from '../i18n/language.tsx'
import { operator } from '../operator/active.ts'

export function SummaryScreen() {
  const { t } = useLanguage()
  const owner = operator.owner_name

  return (
    <>
      <h1>{t('summary_title', { owner })}</h1>
      <p>{t('summary_none', { owner })}</p>
    </>
  )
}
