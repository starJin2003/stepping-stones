import { describe, expect, it, vi } from 'vitest'
import type { OutboxItem } from '../../src/db/types.ts'
import { outboxMessage, sendQueued, type OutboxDeps, type OutboxStore } from '../../src/sync/outbox.ts'

const TOKEN = 'test-sync-token'

const item = (n: number, status: OutboxItem['status'] = 'Queued'): OutboxItem => ({
  id: `group-${n}`,
  text: `Sehemu ${n}: ĩ ũ`,
  created_at: '2026-10-04T09:00:00.000Z',
  status,
  sid: null,
})

function memoryOutbox(items: OutboxItem[]) {
  const rows = new Map(items.map((i) => [i.id, { ...i }]))
  const store: OutboxStore = {
    queued: async () => [...rows.values()].filter((i) => i.status === 'Queued'),
    markSent: async (id, sid) => void rows.set(id, { ...rows.get(id)!, status: 'Sent', sid }),
    markFailed: async (id) => void rows.set(id, { ...rows.get(id)!, status: 'Failed' }),
  }
  return { store, rows, status: () => [...rows.values()].map((i) => i.status) }
}

/** A fake server: answers each send in turn with the given reply. */
function fakeServer(replies: (number | 'network')[]) {
  let call = 0
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const reply = replies[call++] ?? 200
    if (reply === 'network') throw new TypeError('Failed to fetch')
    const body = reply === 200 ? { sid: `SM${String(call).padStart(32, '0')}`, status: 'queued' } : { error: 'send_failed' }
    return new Response(JSON.stringify(body), { status: reply })
  })
}

const deps = (fetch: OutboxDeps['fetch'], store: OutboxStore, overrides: Partial<OutboxDeps> = {}): OutboxDeps => ({
  fetch,
  store,
  serverUrl: '',
  syncToken: TOKEN,
  isOnline: () => true,
  ...overrides,
})

describe('sendQueued', () => {
  it('sends each Queued item in order and marks it Sent with its sid', async () => {
    const outbox = memoryOutbox([item(1), item(2), item(3)])
    const fetch = fakeServer([200, 200, 200])

    const result = await sendQueued(deps(fetch, outbox.store))

    expect(result).toEqual({ kind: 'sent', sent: 3 })
    expect(outbox.status()).toEqual(['Sent', 'Sent', 'Sent'])
    expect(outbox.rows.get('group-1')?.sid).toBe('SM' + '1'.padStart(32, '0'))
    expect(fetch.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).text)).toEqual([
      'Sehemu 1: ĩ ũ',
      'Sehemu 2: ĩ ũ',
      'Sehemu 3: ĩ ũ',
    ])
  })

  it('posts only the text, with the sync code only in the Authorization header', async () => {
    const outbox = memoryOutbox([item(1)])
    const fetch = fakeServer([200])
    await sendQueued(deps(fetch, outbox.store, { serverUrl: 'https://relay.example.com/' }))

    const [url, init] = fetch.mock.calls[0]
    expect(String(url)).toBe('https://relay.example.com/api/outbox/send')
    expect(init?.method).toBe('POST')
    expect(Object.keys(JSON.parse(String(init?.body)))).toEqual(['text'])
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${TOKEN}`)
    expect(String(init?.body)).not.toContain(TOKEN)
  })

  it('marks an item the server could not send as Failed and goes on with the rest', async () => {
    const outbox = memoryOutbox([item(1), item(2), item(3)])
    const result = await sendQueued(deps(fakeServer([200, 502, 200]), outbox.store))
    expect(result).toEqual({ kind: 'some_failed', sent: 2, failed: 1 })
    expect(outbox.status()).toEqual(['Sent', 'Failed', 'Sent'])
  })

  it('treats a reply without a sid as a failure', async () => {
    const outbox = memoryOutbox([item(1)])
    const fetch = vi.fn(async () => new Response('<html>', { status: 200 }))
    expect(await sendQueued(deps(fetch, outbox.store))).toEqual({ kind: 'some_failed', sent: 0, failed: 1 })
    expect(outbox.status()).toEqual(['Failed'])
  })

  it('offline: does not fetch, and everything stays Queued', async () => {
    const outbox = memoryOutbox([item(1), item(2)])
    const fetch = fakeServer([])
    const result = await sendQueued(deps(fetch, outbox.store, { isOnline: () => false }))
    expect(result).toEqual({ kind: 'offline' })
    expect(fetch).not.toHaveBeenCalled()
    expect(outbox.status()).toEqual(['Queued', 'Queued'])
    expect(outboxMessage(result, 'en', 'Noor')).toBe(
      'No connection. The summary is safe on this phone and will go when there is signal.',
    )
  })

  it('losing signal part way: what went is Sent, the rest stays Queued', async () => {
    const outbox = memoryOutbox([item(1), item(2), item(3)])
    const result = await sendQueued(deps(fakeServer([200, 'network']), outbox.store))
    expect(result).toEqual({ kind: 'offline' })
    expect(outbox.status()).toEqual(['Sent', 'Queued', 'Queued'])
  })

  it('401: stops, keeps the items Queued, and shows the sync code message', async () => {
    const outbox = memoryOutbox([item(1), item(2)])
    const fetch = fakeServer([401, 200])
    const result = await sendQueued(deps(fetch, outbox.store))
    expect(result).toEqual({ kind: 'unauthorized' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(outbox.status()).toEqual(['Queued', 'Queued'])
    expect(outboxMessage(result, 'en', 'Noor')).toBe("This phone's sync code was not accepted. Check it under This phone.")
  })

  it('no sync code: does not fetch, and the items stay Queued', async () => {
    const outbox = memoryOutbox([item(1)])
    const fetch = fakeServer([])
    const result = await sendQueued(deps(fetch, outbox.store, { syncToken: '' }))
    expect(result).toEqual({ kind: 'no_sync_code' })
    expect(fetch).not.toHaveBeenCalled()
    expect(outbox.status()).toEqual(['Queued'])
    expect(outboxMessage(result, 'en', 'Noor')).toBe("Add this phone's sync code under This phone first.")
  })

  it('leaves Sent and Failed items alone; only Queued ones go', async () => {
    const outbox = memoryOutbox([item(1, 'Sent'), item(2, 'Failed'), item(3)])
    const fetch = fakeServer([200])
    expect(await sendQueued(deps(fetch, outbox.store))).toEqual({ kind: 'sent', sent: 1 })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(outbox.status()).toEqual(['Sent', 'Failed', 'Sent'])
  })

  it('with nothing queued, does nothing and has nothing to say', async () => {
    const fetch = fakeServer([])
    const result = await sendQueued(deps(fetch, memoryOutbox([]).store))
    expect(result).toEqual({ kind: 'nothing_queued' })
    expect(fetch).not.toHaveBeenCalled()
    expect(outboxMessage(result, 'en', 'Noor')).toBeNull()
  })

  it('names the owner when sent, in both languages', () => {
    expect(outboxMessage({ kind: 'sent', sent: 4 }, 'en', 'Noor')).toBe('Sent to Noor.')
    expect(outboxMessage({ kind: 'sent', sent: 4 }, 'sw', 'Noor')).toBe('Imetumwa kwa Noor.')
  })
})
