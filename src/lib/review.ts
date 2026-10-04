import type { VisitRecord } from '../db/types.ts'

/** The three review buttons: "Same story", "Not linked", "Not sure, leave it". */
export type Decision = 'same_story' | 'not_linked' | 'leave'

export type ReviewFields = Pick<VisitRecord, 'review_status' | 'confirmed_prior_record_id'>

export interface ReviewStore {
  get(id: string): Promise<VisitRecord | undefined>
  /** Changes only the given fields. */
  update(id: string, changes: ReviewFields): Promise<unknown>
}

/** What one decision changed, so a mis-tap can be undone. */
export interface LastDecision {
  record_id: string
  decision: Decision
  before: ReviewFields
  after: ReviewFields
}

const reviewFields = (r: VisitRecord): ReviewFields => ({
  review_status: r.review_status,
  confirmed_prior_record_id: r.confirmed_prior_record_id,
})

/**
 * A person's decision on a record waiting for review. This and undo() are the only code that changes
 * review_status or confirmed_prior_record_id; analysis never does.
 * Same story links to one of the record's own candidates. Not sure leaves it Pending.
 * Returns null and changes nothing when the record is gone, already decided, or the candidate is not its own.
 */
export async function decide(
  store: ReviewStore,
  recordId: string,
  decision: Decision,
  candidateId?: string,
): Promise<LastDecision | null> {
  const record = await store.get(recordId)
  if (!record || record.review_status !== 'Pending') return null
  const before = reviewFields(record)

  let after: ReviewFields
  switch (decision) {
    case 'same_story':
      if (!candidateId || !record.candidate_prior_record_ids?.includes(candidateId)) return null
      after = { review_status: 'Confirmed', confirmed_prior_record_id: candidateId }
      break
    case 'not_linked':
      after = { review_status: 'Rejected', confirmed_prior_record_id: null }
      break
    case 'leave':
      return { record_id: recordId, decision, before, after: before }
  }
  await store.update(recordId, after)
  return { record_id: recordId, decision, before, after }
}

/** Puts the record back as it was before the last decision, unless something else has changed it since. */
export async function undo(store: ReviewStore, last: LastDecision): Promise<boolean> {
  const record = await store.get(last.record_id)
  if (!record) return false
  const now = reviewFields(record)
  if (now.review_status !== last.after.review_status || now.confirmed_prior_record_id !== last.after.confirmed_prior_record_id) {
    return false
  }
  if (last.decision !== 'leave') await store.update(last.record_id, last.before)
  return true
}
