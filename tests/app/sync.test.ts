import { describe, expect, it, vi } from 'vitest'
import { newRecord, type VisitRecord } from '../../src/db/types.ts'
import { getNewMessages, syncMessage, type SyncDeps, type SyncStore } from '../../src/sync/sync.ts'

const TOKEN = 'test-sync-token'

const pulled = (n: number, start = 0) =>
  Array.from({ length: n }, (_, i) => ({
    message_id: 'SM' + String(start + i).padStart(32, '0'),
    sender_hash: 'a'.repeat(64),
    received_at: new Date(Date.UTC(2026, 9, 1, 12, 0, start + i)).toISOString(),
    channel: 'SMS',
    raw_text: `1) heard ${start + i} 2) would tell ${start + i}`,
    num_media: 0,
  }))

/** A fake server. `events` records the order of pull, write, and ack across server and store. */
function fakeServer(
  records: unknown[],
  options: { pullStatus?: number; ackStatus?: number; pullThrows?: boolean; ackThrows?: boolean } = {},
) {
  const events: string[] = []
  const acked: string[][] = []
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    if (url.endsWith('/api/sync/pull')) {
      events.push('pull')
      if (options.pullThrows) throw new TypeError('Failed to fetch')
      return new Response(JSON.stringify({ records }), { status: options.pullStatus ?? 200 })
    }
    if (url.endsWith('/api/sync/ack')) {
      events.push('ack')
      if (options.ackThrows) throw new TypeError('Failed to fetch')
      acked.push(JSON.parse(String(init?.body)).ids)
      return new Response('{}', { status: options.ackStatus ?? 200 })
    }
    throw new Error(`unexpected request ${url}`)
  })
  return { fetch, events, acked }
}

function memoryStore(events: string[], { fail = false } = {}) {
  const records = new Map<string, VisitRecord>()
  const store: SyncStore = {
    async saveNew(batch) {
      events.push('write')
      if (fail) throw new Error('QuotaExceededError')
      let added = 0
      for (const r of batch) {
        if (!records.has(r.record_id)) {
          records.set(r.record_id, r)
          added++
        }
      }
      return added
    },
  }
  return { store, records }
}

function deps(server: ReturnType<typeof fakeServer>, store: SyncStore, overrides: Partial<SyncDeps> = {}): SyncDeps {
  return { fetch: server.fetch, store, serverUrl: '', syncToken: TOKEN, isOnline: () => true, ...overrides }
}

describe('getNewMessages', () => {
  it('saves pulled records first and acks them only after the write', async () => {
    const server = fakeServer(pulled(3))
    const { store, records } = memoryStore(server.events)

    const result = await getNewMessages(deps(server, store))

    expect(server.events).toEqual(['pull', 'write', 'ack'])
    expect(result).toEqual({ kind: 'saved', saved: 3 })
    expect(syncMessage(result, 'en')).toBe('3 new messages saved on this phone.')
    expect(server.acked).toEqual([pulled(3).map((r) => r.message_id)])

    const saved = records.get(pulled(1)[0].message_id)!
    expect(saved).toMatchObject({
      record_id: pulled(1)[0].message_id,
      raw_text_local: '1) heard 0 2) would tell 0',
      created_from: 'SMS',
      review_status: 'Pending',
      synthetic: false,
      incoming_embedding: null,
      match_strength: null,
    })
  })

  it('sends the sync code only in the Authorization header', async () => {
    const server = fakeServer(pulled(1))
    await getNewMessages(deps(server, memoryStore(server.events).store, { serverUrl: 'https://relay.example.com/' }))

    for (const [url, init] of server.fetch.mock.calls) {
      expect(String(url)).toMatch(/^https:\/\/relay\.example\.com\/api\/sync\/(pull|ack)$/)
      expect(String(url)).not.toContain(TOKEN)
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${TOKEN}`)
      expect(String(init?.body ?? '')).not.toContain(TOKEN)
    }
  })

  it('does not ack when the write fails', async () => {
    const server = fakeServer(pulled(3))
    const { store } = memoryStore(server.events, { fail: true })

    const result = await getNewMessages(deps(server, store))

    expect(result).toEqual({ kind: 'write_failed' })
    expect(server.events).toEqual(['pull', 'write'])
    expect(server.acked).toEqual([])
  })

  it('acks in chunks of 100', async () => {
    const all = pulled(250)
    const server = fakeServer(all)
    const { store } = memoryStore(server.events)

    const result = await getNewMessages(deps(server, store))

    expect(result).toEqual({ kind: 'saved', saved: 250 })
    expect(server.acked.map((chunk) => chunk.length)).toEqual([100, 100, 50])
    expect(server.acked.flat()).toEqual(all.map((r) => r.message_id))
    expect(server.events).toEqual(['pull', 'write', 'ack', 'ack', 'ack'])
  })

  it('does not duplicate or overwrite records pulled twice', async () => {
    const server = fakeServer(pulled(3))
    const { store, records } = memoryStore(server.events)
    await getNewMessages(deps(server, store))
    const first = pulled(1)[0].message_id
    records.set(first, { ...records.get(first)!, review_status: 'Confirmed', confirmed_prior_record_id: 'seed-1' })

    const again = await getNewMessages(deps(server, store))

    expect(again).toEqual({ kind: 'nothing_new' })
    expect(syncMessage(again, 'en')).toBe('No new messages.')
    expect(records.size).toBe(3)
    expect(records.get(first)).toMatchObject({ review_status: 'Confirmed', confirmed_prior_record_id: 'seed-1' })
    // Already-saved ids are acked again, so a server copy left by a failed ack gets cleared.
    expect(server.acked).toHaveLength(2)
  })

  it('reports a failed ack but keeps what it saved', async () => {
    const server = fakeServer(pulled(2), { ackStatus: 500 })
    const { store, records } = memoryStore(server.events)

    const result = await getNewMessages(deps(server, store))

    expect(result).toEqual({ kind: 'ack_failed', saved: 2 })
    expect(syncMessage(result, 'en')).toBe('Saved on this phone. The server copy will be cleared next time.')
    expect(records.size).toBe(2)
  })

  it('reports an ack that cannot reach the server as a failed ack', async () => {
    const server = fakeServer(pulled(2), { ackThrows: true })
    const result = await getNewMessages(deps(server, memoryStore(server.events).store))
    expect(result).toEqual({ kind: 'ack_failed', saved: 2 })
  })

  it('says so when the sync code is not accepted', async () => {
    const server = fakeServer(pulled(2), { pullStatus: 401 })
    const result = await getNewMessages(deps(server, memoryStore(server.events).store))
    expect(result).toEqual({ kind: 'unauthorized' })
    expect(syncMessage(result, 'en')).toBe("This phone's sync code was not accepted. Check it under This phone.")
    expect(server.events).toEqual(['pull'])
  })

  it('says so when the network fails', async () => {
    const server = fakeServer(pulled(2), { pullThrows: true })
    const result = await getNewMessages(deps(server, memoryStore(server.events).store))
    expect(result).toEqual({ kind: 'offline' })
    expect(syncMessage(result, 'en')).toBe(
      'No connection. Your messages are safe on this phone. Try again when you have signal.',
    )
    expect(server.events).toEqual(['pull'])
  })

  it('does not fetch at all when the phone is offline', async () => {
    const server = fakeServer(pulled(2))
    const result = await getNewMessages(deps(server, memoryStore(server.events).store, { isOnline: () => false }))
    expect(result).toEqual({ kind: 'offline' })
    expect(server.fetch).not.toHaveBeenCalled()
  })

  it('does not fetch without a sync code', async () => {
    const server = fakeServer(pulled(2))
    const result = await getNewMessages(deps(server, memoryStore(server.events).store, { syncToken: '' }))
    expect(result).toEqual({ kind: 'no_sync_code' })
    expect(server.fetch).not.toHaveBeenCalled()
  })

  it('says no new messages when the inbox is empty, without writing or acking', async () => {
    const server = fakeServer([])
    const result = await getNewMessages(deps(server, memoryStore(server.events).store))
    expect(result).toEqual({ kind: 'nothing_new' })
    expect(server.events).toEqual(['pull'])
  })

  it('treats a server error or a malformed reply as a server problem', async () => {
    const broken = fakeServer(pulled(1), { pullStatus: 500 })
    expect(await getNewMessages(deps(broken, memoryStore(broken.events).store))).toEqual({ kind: 'server_error' })

    const garbled = fakeServer(pulled(1))
    garbled.fetch.mockResolvedValueOnce(new Response('<html>', { status: 200 }))
    expect(await getNewMessages(deps(garbled, memoryStore(garbled.events).store))).toEqual({ kind: 'server_error' })
  })

  it('skips malformed records and never acks them', async () => {
    const server = fakeServer([...pulled(1), { message_id: 'SMbad', raw_text: 42 }])
    const { store, records } = memoryStore(server.events)
    await getNewMessages(deps(server, store))
    expect(records.size).toBe(1)
    expect(server.acked.flat()).toEqual([pulled(1)[0].message_id])
  })

  it('uses singular wording for one message, in both languages', () => {
    expect(syncMessage({ kind: 'saved', saved: 1 }, 'en')).toBe('1 new message saved on this phone.')
    expect(syncMessage({ kind: 'saved', saved: 1 }, 'sw')).toBe('Ujumbe 1 mpya umehifadhiwa kwenye simu hii.')
    expect(syncMessage({ kind: 'saved', saved: 3 }, 'sw')).toBe('Jumbe 3 mpya zimehifadhiwa kwenye simu hii.')
  })

  it('has a Kiswahili message for every result', () => {
    const kinds = ['nothing_new', 'ack_failed', 'unauthorized', 'offline', 'no_sync_code', 'server_error', 'write_failed'] as const
    for (const kind of kinds) {
      const sw = syncMessage({ kind, saved: 1 } as Parameters<typeof syncMessage>[0], 'sw')
      expect(sw).not.toBe(syncMessage({ kind, saved: 1 } as Parameters<typeof syncMessage>[0], 'en'))
      expect(sw).not.toMatch(/\{\w+\}/)
    }
  })
})

// Keep newRecord's defaults honest: every analysis field starts empty.
it('newRecord leaves analysis fields null and review Pending', () => {
  const r = newRecord({
    record_id: 'x',
    sender_hash: null,
    received_at: '2026-10-01T00:00:00Z',
    raw_text_local: 't',
    created_from: 'Paste',
    synthetic: false,
  })
  const analysis = [
    'incoming_story_text',
    'outgoing_story_text',
    'format_ok',
    'detected_language',
    'referral_source_category',
    'visit_reason_category',
    'pass_on_category',
    'incoming_embedding',
    'outgoing_embedding',
    'candidate_prior_record_ids',
    'match_strength',
    'confirmed_prior_record_id',
  ] as const
  for (const field of analysis) expect(r[field]).toBeNull()
  expect(r.review_status).toBe('Pending')
})
