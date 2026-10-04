import { decide, undo, type Decision, type LastDecision, type ReviewStore } from '../lib/review.ts'
import { loadSampleHistoryFile } from '../operator/active.ts'
import { db } from './db.ts'
import { parseSampleHistory } from './seed.ts'
import { newRecord, type VisitRecord } from './types.ts'

export const MAX_PASTE_CHARS = 1600

const reviewStore: ReviewStore = {
  get: (id) => db.records.get(id),
  update: (id, changes) => db.records.update(id, changes),
}

/** A review button tap, read and written in one transaction. */
export const decideOnPhone = (id: string, decision: Decision, candidateId?: string): Promise<LastDecision | null> =>
  db.transaction('rw', db.records, () => decide(reviewStore, id, decision, candidateId))

export const undoOnPhone = (last: LastDecision): Promise<boolean> =>
  db.transaction('rw', db.records, () => undo(reviewStore, last))

/**
 * Adds records whose record_id is not on this phone yet, in one transaction. Never overwrites.
 * Resolves only after the transaction has committed, with the number added.
 */
export async function saveNewRecords(records: VisitRecord[]): Promise<number> {
  return db.transaction('rw', db.records, async () => {
    const unique = [...new Map(records.map((r) => [r.record_id, r])).values()]
    const existing = await db.records.bulkGet(unique.map((r) => r.record_id))
    const fresh = unique.filter((_, i) => existing[i] === undefined)
    await db.records.bulkAdd(fresh)
    return fresh.length
  })
}

export async function addPastedMessage(text: string): Promise<void> {
  await db.records.add(
    newRecord({
      record_id: `paste-${crypto.randomUUID()}`,
      sender_hash: null,
      received_at: new Date().toISOString(),
      raw_text_local: text,
      created_from: 'Paste',
      synthetic: false,
    }),
  )
}

/**
 * Deletes every synthetic record. A real record that a person had linked to a sample visit
 * loses that link and goes back to review, because the visit it pointed at is gone.
 */
export async function removeSampleHistory(): Promise<number> {
  return db.transaction('rw', db.records, async () => {
    const removed = new Set((await db.records.filter((r) => r.synthetic).primaryKeys()) as string[])
    await db.records.bulkDelete([...removed])
    await db.records
      .filter((r) => r.confirmed_prior_record_id !== null && removed.has(r.confirmed_prior_record_id))
      .modify({ confirmed_prior_record_id: null, review_status: 'Pending' })
    await db.records
      .filter((r) => r.candidate_prior_record_ids?.some((id) => removed.has(id)) ?? false)
      .modify((r) => {
        r.candidate_prior_record_ids = r.candidate_prior_record_ids!.filter((id) => !removed.has(id))
      })
    return removed.size
  })
}

/** Adds the active operator's synthetic sample history, skipping visits already on this phone. */
export async function loadSampleHistory(): Promise<number> {
  const { records } = parseSampleHistory(await loadSampleHistoryFile())
  return saveNewRecords(records)
}
