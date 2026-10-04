import { newRecord, type VisitRecord } from '../db/types.ts'

export const ACK_CHUNK_SIZE = 100
const TIMEOUT_MS = 30_000

export interface SyncStore {
  /** Adds records not on the phone yet, in one transaction, never overwriting. Resolves after commit with how many were added. */
  saveNew(records: VisitRecord[]): Promise<number>
}

export interface SyncDeps {
  fetch: typeof fetch
  store: SyncStore
  /** Empty means the same site the app was loaded from. */
  serverUrl: string
  syncToken: string
  isOnline: () => boolean
}

export type SyncResult =
  | { kind: 'saved'; saved: number }
  | { kind: 'nothing_new' }
  | { kind: 'ack_failed'; saved: number }
  | { kind: 'unauthorized' }
  | { kind: 'offline' }
  | { kind: 'no_sync_code' }
  | { kind: 'server_error' }
  | { kind: 'write_failed' }

interface PulledRecord {
  message_id: string
  sender_hash: string
  received_at: string
  raw_text: string
}

function isPulledRecord(value: unknown): value is PulledRecord {
  const r = value as Record<string, unknown> | null
  return (
    typeof r?.message_id === 'string' &&
    r.message_id !== '' &&
    typeof r.sender_hash === 'string' &&
    typeof r.raw_text === 'string' &&
    typeof r.received_at === 'string' &&
    !Number.isNaN(Date.parse(r.received_at))
  )
}

const toVisitRecord = (r: PulledRecord): VisitRecord =>
  newRecord({
    record_id: r.message_id,
    sender_hash: r.sender_hash,
    received_at: r.received_at,
    raw_text_local: r.raw_text,
    created_from: 'SMS',
    synthetic: false,
  })

/**
 * Pulls new messages, saves them on the phone in one transaction, and only after that commits asks the
 * server to clear them. Never logs message text or the sync code; the code goes only in the Authorization header.
 */
export async function getNewMessages(deps: SyncDeps): Promise<SyncResult> {
  if (!deps.syncToken) return { kind: 'no_sync_code' }
  if (!deps.isOnline()) return { kind: 'offline' }

  const base = deps.serverUrl.trim().replace(/\/+$/, '')
  const authorization = `Bearer ${deps.syncToken}`

  let pulled: PulledRecord[]
  try {
    const response = await deps.fetch(`${base}/api/sync/pull`, {
      headers: { authorization },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (response.status === 401) return { kind: 'unauthorized' }
    if (!response.ok) return { kind: 'server_error' }
    const body = (await response.json()) as { records?: unknown }
    if (!Array.isArray(body?.records)) return { kind: 'server_error' }
    const byId = new Map(body.records.filter(isPulledRecord).map((r) => [r.message_id, r]))
    pulled = [...byId.values()]
  } catch (err) {
    return { kind: err instanceof SyntaxError ? 'server_error' : 'offline' }
  }
  if (pulled.length === 0) return { kind: 'nothing_new' }

  let saved: number
  try {
    saved = await deps.store.saveNew(pulled.map(toVisitRecord))
  } catch {
    return { kind: 'write_failed' }
  }

  // Every pulled id is now on the phone, including ones saved by an earlier sync whose ack failed.
  const ids = pulled.map((r) => r.message_id)
  let ackOk = true
  for (let i = 0; i < ids.length; i += ACK_CHUNK_SIZE) {
    try {
      const response = await deps.fetch(`${base}/api/sync/ack`, {
        method: 'POST',
        headers: { authorization, 'content-type': 'application/json' },
        body: JSON.stringify({ ids: ids.slice(i, i + ACK_CHUNK_SIZE) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!response.ok) ackOk = false
    } catch {
      ackOk = false
    }
  }

  if (!ackOk) return { kind: 'ack_failed', saved }
  return saved === 0 ? { kind: 'nothing_new' } : { kind: 'saved', saved }
}

export function syncMessage(result: SyncResult): string {
  switch (result.kind) {
    case 'saved':
      return `${result.saved} new ${result.saved === 1 ? 'message' : 'messages'} saved on this phone.`
    case 'nothing_new':
      return 'No new messages.'
    case 'ack_failed':
      return 'Saved on this phone. The server copy will be cleared next time.'
    case 'unauthorized':
      return "This phone's sync code was not accepted. Check it under This phone."
    case 'offline':
      return 'No connection. Your messages are safe on this phone. Try again when you have signal.'
    case 'no_sync_code':
      return "Add this phone's sync code under This phone first."
    case 'server_error':
      return 'The server had a problem. Your messages are safe on this phone. Try again later.'
    case 'write_failed':
      return 'Could not save on this phone, so nothing was cleared from the server. Try again.'
  }
}
