// Whether analysis is running, and on how many records. Light, so the screen can show it without loading the analysis.
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useSyncExternalStore } from 'react'
import { db } from '../db/db.ts'
import { ANALYSIS_VERSION } from './app-setup.ts'
import { useModelStatus } from './client.ts'

let analysing = 0
const listeners = new Set<() => void>()

export function setAnalysing(n: number) {
  analysing = n
  for (const listener of listeners) listener()
}

/** How many records are being analysed right now; 0 when idle. */
export function useAnalysing(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => analysing,
  )
}

/** Once the model is ready, analyses anything new or out of date: synced, pasted, or sample history. */
export function useAutoAnalysis() {
  const model = useModelStatus()
  const outOfDate = useLiveQuery(() => db.records.filter((r) => r.analysis_version !== ANALYSIS_VERSION).count())
  useEffect(() => {
    if (model.kind !== 'ready' || !outOfDate) return
    // A failure stops here; it is retried when records or the model change, never in a loop.
    import('./runner.ts')
      .then((runner) => runner.analyseWhatIsNew())
      .catch(() => setAnalysing(0))
  }, [model.kind, outOfDate])
}
