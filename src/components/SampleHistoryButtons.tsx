import { useState } from 'react'
import { loadSampleHistory, removeSampleHistory } from '../db/records.ts'

export function SampleHistoryButtons({ showRemove }: { showRemove: boolean }) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  async function run(action: () => Promise<string>) {
    setBusy(true)
    try {
      setNotice(await action())
    } catch {
      setNotice('Could not change sample history on this phone. Try again.')
    }
    setBusy(false)
  }

  const load = () =>
    run(async () => {
      const added = await loadSampleHistory()
      return added === 0 ? 'Sample history is already on this phone.' : `Sample history loaded: ${added} synthetic visits.`
    })

  const remove = () =>
    run(async () => {
      const removed = await removeSampleHistory()
      return removed === 0 ? 'There was no sample history to remove.' : 'Sample history removed.'
    })

  return (
    <div className="stack">
      <div className="button-row">
        <button className="button button-secondary" type="button" onClick={load} disabled={busy}>
          Load sample history (synthetic)
        </button>
        {showRemove && (
          <button className="button button-secondary" type="button" onClick={remove} disabled={busy}>
            Remove sample history
          </button>
        )}
      </div>
      <p className="notice" role="status">
        {notice}
      </p>
    </div>
  )
}
