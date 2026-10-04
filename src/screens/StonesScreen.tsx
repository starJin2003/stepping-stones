import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db.ts'
import { useLanguage } from '../i18n/language.tsx'
import { countKey } from '../i18n/strings.ts'

export function StonesScreen() {
  const { t } = useLanguage()
  const confirmed = useLiveQuery(() => db.records.where('review_status').equals('Confirmed').count())

  return (
    <>
      <h1>{t('stones_title')}</h1>
      {confirmed !== undefined && (
        <p>
          {confirmed === 0
            ? t('stones_none')
            : t(countKey(confirmed, 'stones_count_one', 'stones_count_other'), { n: confirmed })}
        </p>
      )}
    </>
  )
}
