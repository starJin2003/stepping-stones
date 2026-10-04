import { useSyncExternalStore } from 'react'
import { sendQueued, type OutboxResult, type OutboxStore } from '../sync/outbox.ts'
import { db } from './db.ts'
import type { OutboxItem } from './types.ts'

/** Oldest summary first, then its parts in order. */
export const outboxOrder = (a: OutboxItem, b: OutboxItem) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)

/**
 * Called only from the "Send to" button: puts each part in the outbox as Queued and starts the next
 * summary period, in one transaction.
 */
export async function queueSummary(texts: string[], now = new Date()): Promise<void> {
  const created_at = now.toISOString()
  const group = crypto.randomUUID()
  await db.transaction('rw', db.outbox, db.settings, async () => {
    await db.outbox.bulkAdd(
      texts.map((text, i): OutboxItem => ({ id: `${group}-${i + 1}`, text, created_at, status: 'Queued', sid: null })),
    )
    await db.settings.put({ key: 'last_summary_at', value: created_at })
  })
}

/** A person's retry: Failed items go back to Queued, then everything waiting is sent. */
export async function retryUnsent(): Promise<void> {
  await db.outbox.where('status').equals('Failed').modify({ status: 'Queued' })
  await sendOutboxNow()
}

const store: OutboxStore = {
  queued: async () => (await db.outbox.where('status').equals('Queued').toArray()).sort(outboxOrder),
  markSent: async (id, sid) => void (await db.outbox.update(id, { status: 'Sent', sid })),
  markFailed: async (id) => void (await db.outbox.update(id, { status: 'Failed' })),
}

interface OutboxState {
  sending: boolean
  /** The last attempt that had something to send. */
  last: OutboxResult | null
}

let state: OutboxState = { sending: false, last: null }
let again = false
const listeners = new Set<() => void>()
const setState = (next: Partial<OutboxState>) => {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

export function useOutboxState(): OutboxState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}

/**
 * Sends whatever is Queued. Called on the button tap, when the app opens, and on the online event.
 * One run at a time; a call during a run makes it go round once more, so newly queued parts are not left behind.
 */
export async function sendOutboxNow(): Promise<void> {
  if (state.sending) {
    again = true
    return
  }
  setState({ sending: true })
  try {
    do {
      again = false
      const settings = Object.fromEntries((await db.settings.toArray()).map((row) => [row.key, row.value]))
      const result = await sendQueued({
        fetch: window.fetch.bind(window),
        store,
        serverUrl: settings.server_url ?? '',
        syncToken: settings.sync_token ?? '',
        isOnline: () => navigator.onLine,
      })
      if (result.kind !== 'nothing_queued') setState({ last: result })
    } while (again)
  } finally {
    setState({ sending: false })
  }
}
