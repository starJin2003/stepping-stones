// Analyses records on this phone with the on-device model. Loaded only once the model is ready.
import { db } from '../db/db.ts'
import { analysisPatches, embedPrototypes, type Prototypes } from './analyze.ts'
import { ANALYSIS_VERSION, SETUP } from './app-setup.ts'
import { setAnalysing } from './analysing.ts'
import { embedOnDevice } from './client.ts'
import { prototypeKey } from './setup.ts'

let running: Promise<void> | null = null

/** Analyses every record that is new or out of date, until none are left. Safe to call repeatedly. */
export function analyseWhatIsNew(): Promise<void> {
  running ??= (async () => {
    try {
      while (await analyseOnce());
    } finally {
      setAnalysing(0)
      running = null
    }
  })()
  return running
}

/** Prototype embeddings are computed once per prototype set and kept on the phone. */
async function prototypes(): Promise<Prototypes> {
  const key = prototypeKey(SETUP)
  const stored = await db.ai_cache.get(key)
  if (stored) return stored.prototypes
  const fresh = await embedPrototypes(SETUP, embedOnDevice)
  await db.transaction('rw', db.ai_cache, async () => {
    await db.ai_cache.clear()
    await db.ai_cache.put({ key, prototypes: fresh })
  })
  return fresh
}

async function analyseOnce(): Promise<boolean> {
  const all = await db.records.orderBy('received_at').toArray()
  const stale = all.filter((r) => r.analysis_version !== ANALYSIS_VERSION).length
  if (stale === 0) return false
  setAnalysing(stale)

  const patches = await analysisPatches(all, SETUP, await prototypes(), embedOnDevice, ANALYSIS_VERSION)
  await db.transaction('rw', db.records, async () => {
    // Partial updates of analysis fields only: a decision a person made meanwhile is kept.
    for (const [id, patch] of patches) await db.records.update(id, patch)
  })
  return true
}
