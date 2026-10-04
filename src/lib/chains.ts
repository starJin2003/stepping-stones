import type { VisitRecord } from '../db/types.ts'

export type ChainRecord = Pick<VisitRecord, 'record_id' | 'received_at' | 'review_status' | 'confirmed_prior_record_id' | 'synthetic'>

const byTime = (a: ChainRecord, b: ChainRecord) =>
  Date.parse(a.received_at) - Date.parse(b.received_at) || a.record_id.localeCompare(b.record_id)

/** A person confirmed this record's link, and the visit it points at is still on the phone. */
const hasLink = (r: ChainRecord, ids: ReadonlySet<string>): r is ChainRecord & { confirmed_prior_record_id: string } =>
  r.review_status === 'Confirmed' &&
  r.confirmed_prior_record_id !== null &&
  r.confirmed_prior_record_id !== r.record_id &&
  ids.has(r.confirmed_prior_record_id)

/**
 * Chains are the connected components of confirmed links, each ordered by received_at, oldest first.
 * A visitor with no confirmed link is in no chain. The chain with the newest visit comes first.
 */
export function buildChains<R extends ChainRecord>(records: readonly R[]): R[][] {
  const byId = new Map(records.map((r) => [r.record_id, r]))
  const ids = new Set(byId.keys())
  const parent = new Map<string, string>()
  const root = (id: string): string => {
    let r = id
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!
    parent.set(id, r)
    return r
  }

  for (const r of records) {
    if (!hasLink(r, ids)) continue
    for (const id of [r.record_id, r.confirmed_prior_record_id]) if (!parent.has(id)) parent.set(id, id)
    parent.set(root(r.record_id), root(r.confirmed_prior_record_id))
  }

  const groups = new Map<string, R[]>()
  for (const id of parent.keys()) {
    const key = root(id)
    groups.set(key, [...(groups.get(key) ?? []), byId.get(id)!])
  }
  const chains = [...groups.values()].map((chain) => chain.sort(byTime))
  return chains.sort((a, b) => byTime(b[b.length - 1], a[a.length - 1]))
}

/**
 * The confirmed visit with the newest received_at. No confirmation time is stored, so the newest
 * confirmed visit stands in for the most recently confirmed one.
 */
export function latestConfirmed(records: readonly ChainRecord[]): string | null {
  const ids = new Set(records.map((r) => r.record_id))
  const confirmed = records.filter((r) => hasLink(r, ids)).sort(byTime)
  return confirmed.at(-1)?.record_id ?? null
}
