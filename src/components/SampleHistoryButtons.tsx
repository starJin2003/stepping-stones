import { useState } from 'react'
import { loadSampleHistory, removeSampleHistory } from '../db/records.ts'
import { useLanguage } from '../i18n/language.tsx'
import type { StringKey } from '../i18n/strings.ts'

export function SampleHistoryButtons({ showRemove }: { showRemove: boolean }) {
  const { t } = useLanguage()
  const [busy, setBusy] = useState(false)
  // Kept as a key so the notice follows a language switch.
  const [notice, setNotice] = useState<{ key: StringKey; n?: number } | null>(null)

  async function run(action: () => Promise<{ key: StringKey; n?: number }>) {
    setBusy(true)
    try {
      setNotice(await action())
    } catch {
      setNotice({ key: 'sample_failed' })
    }
    setBusy(false)
  }

  const load = () =>
    run(async () => {
      const added = await loadSampleHistory()
      return added === 0 ? { key: 'sample_already' } : { key: 'sample_loaded', n: added }
    })

  const remove = () =>
    run(async () => ((await removeSampleHistory()) === 0 ? { key: 'sample_nothing' } : { key: 'sample_removed' }))

  return (
    <div className="stack">
      <div className="button-row">
        <button className="button button-secondary" type="button" onClick={load} disabled={busy}>
          {t('sample_load')}
        </button>
        {showRemove && (
          <button className="button button-secondary" type="button" onClick={remove} disabled={busy}>
            {t('sample_remove')}
          </button>
        )}
      </div>
      <p className="notice" role="status">
        {notice && t(notice.key, { n: notice.n ?? 0 })}
      </p>
    </div>
  )
}
