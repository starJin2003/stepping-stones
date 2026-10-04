import type { OutboxItem } from '../db/types.ts'
import { translate, type Lang, type StringKey } from '../i18n/strings.ts'

const TIMEOUT_MS = 30_000

export interface OutboxStore {
  /** Items waiting to go, oldest summary first, parts in order. */
  queued(): Promise<OutboxItem[]>
  markSent(id: string, sid: string): Promise<void>
  markFailed(id: string): Promise<void>
}

export interface OutboxDeps {
  fetch: typeof fetch
  store: OutboxStore
  /** Empty means the same site the app was loaded from. */
  serverUrl: string
  syncToken: string
  isOnline: () => boolean
}

export type OutboxResult =
  | { kind: 'nothing_queued' }
  | { kind: 'sent'; sent: number }
  | { kind: 'some_failed'; sent: number; failed: number }
  /** Everything not sent yet stays Queued and goes when there is signal. */
  | { kind: 'offline' }
  | { kind: 'unauthorized' }
  | { kind: 'no_sync_code' }

async function readSid(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { sid?: unknown }
    return typeof body?.sid === 'string' && body.sid !== '' ? body.sid : null
  } catch {
    return null
  }
}

/**
 * Sends each Queued item through the server, one at a time and in order, so the parts arrive in order.
 * The request carries only the text: the server alone knows who receives it. A sent item becomes Sent with
 * its sid; one the server could not send becomes Failed, which a person can retry. Without signal, or when
 * the sync code is missing or refused, nothing changes and the items stay Queued.
 */
export async function sendQueued(deps: OutboxDeps): Promise<OutboxResult> {
  const items = await deps.store.queued()
  if (items.length === 0) return { kind: 'nothing_queued' }
  if (!deps.syncToken) return { kind: 'no_sync_code' }
  if (!deps.isOnline()) return { kind: 'offline' }

  const url = `${deps.serverUrl.trim().replace(/\/+$/, '')}/api/outbox/send`
  let sent = 0
  let failed = 0
  for (const item of items) {
    let response: Response
    try {
      response = await deps.fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${deps.syncToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ text: item.text }),
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      return { kind: 'offline' }
    }
    if (response.status === 401) return { kind: 'unauthorized' }
    const sid = response.ok ? await readSid(response) : null
    if (sid) {
      await deps.store.markSent(item.id, sid)
      sent++
    } else {
      await deps.store.markFailed(item.id)
      failed++
    }
  }
  return failed > 0 ? { kind: 'some_failed', sent, failed } : { kind: 'sent', sent }
}

const RESULT_KEYS: Record<Exclude<OutboxResult['kind'], 'nothing_queued'>, StringKey> = {
  sent: 'outbox_sent',
  some_failed: 'outbox_some_failed',
  offline: 'outbox_offline',
  unauthorized: 'sync_unauthorized',
  no_sync_code: 'sync_no_code',
}

/** What to tell the person after a send attempt, or null when there was nothing to send. */
export function outboxMessage(result: OutboxResult, lang: Lang, owner: string): string | null {
  if (result.kind === 'nothing_queued') return null
  return translate(lang, RESULT_KEYS[result.kind], { owner })
}
