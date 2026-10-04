import { describe, expect, it } from 'vitest'
import { handleAck, handlePull } from '../server/handlers.js'
import { authed, makeDeps, newSid, record } from './helpers.js'

const BAD_TOKENS: [string, string | null][] = [
  ['no token', null],
  ['a wrong token', 'not-the-sync-token'],
  ['a token that is a prefix of the real one', 'test-sync'],
  ['an empty token', ''],
]

describe('auth on /api/sync/*', () => {
  it.each(BAD_TOKENS)('pull returns 401 with %s', async (_label, token) => {
    const { deps, store } = makeDeps()
    await store.put(record())
    const res = await handlePull(authed('/api/sync/pull', { method: 'GET', token }), deps)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it.each(BAD_TOKENS)('ack returns 401 with %s and deletes nothing', async (_label, token) => {
    const { deps, store, remove } = makeDeps()
    const r = record()
    await store.put(r)
    const res = await handleAck(authed('/api/sync/ack', { token, body: { ids: [r.message_id] } }), deps)
    expect(res.status).toBe(401)
    expect(await store.listPending()).toHaveLength(1)
    expect(remove).not.toHaveBeenCalled()
  })

  it('rejects a non-Bearer scheme', async () => {
    const { deps } = makeDeps()
    const req = new Request('https://x.example.com/api/sync/pull', { headers: { authorization: 'Basic dGVzdC1zeW5jLXRva2Vu' } })
    expect((await handlePull(req, deps)).status).toBe(401)
  })

  it('fails closed when SYNC_TOKEN is empty', async () => {
    const { deps } = makeDeps()
    const res = await handlePull(authed('/api/sync/pull', { method: 'GET', token: '' }), {
      ...deps,
      config: { ...deps.config, syncToken: '' },
    })
    expect(res.status).toBe(401)
  })
})

describe('GET /api/sync/pull', () => {
  it('returns pending records oldest first', async () => {
    const { deps, store } = makeDeps()
    const older = record({ received_at: '2026-09-01T10:00:00.000Z' })
    const newer = record({ received_at: '2026-09-02T10:00:00.000Z' })
    await store.put(newer)
    await store.put(older)

    const res = await handlePull(authed('/api/sync/pull', { method: 'GET' }), deps)

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ records: [older, newer] })
  })
})

describe('POST /api/sync/ack', () => {
  it('deletes acked records from the store and removes each one from Twilio', async () => {
    const { deps, store, remove } = makeDeps()
    const a = record()
    const b = record()
    const keep = record()
    await Promise.all([store.put(a), store.put(b), store.put(keep)])

    const res = await handleAck(authed('/api/sync/ack', { body: { ids: [a.message_id, b.message_id] } }), deps)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      deleted: 2,
      twilio: { removed: [a.message_id, b.message_id], already_gone: [], failed: [] },
    })
    expect(await store.listPending()).toEqual([keep])
    expect(remove).toHaveBeenCalledTimes(2)
    expect(remove).toHaveBeenCalledWith(a.message_id)
    expect(remove).toHaveBeenCalledWith(b.message_id)
  })

  it('reports a Twilio failure without undoing the store delete', async () => {
    const { deps, store, remove } = makeDeps()
    const ok = record()
    const broken = record()
    const gone = record()
    await Promise.all([store.put(ok), store.put(broken), store.put(gone)])
    remove.mockImplementation(async (sid) => {
      if (sid === broken.message_id) throw Object.assign(new Error('Twilio is down'), { status: 503, code: 20503 })
      if (sid === gone.message_id) throw Object.assign(new Error('not found'), { status: 404, code: 20404 })
      return true
    })

    const res = await handleAck(
      authed('/api/sync/ack', { body: { ids: [ok.message_id, broken.message_id, gone.message_id] } }),
      deps,
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      deleted: 3,
      twilio: {
        removed: [ok.message_id],
        already_gone: [gone.message_id],
        failed: [{ id: broken.message_id, status: 503, code: 20503 }],
      },
    })
    expect(await store.listPending()).toEqual([])
  })

  it('retries the Twilio delete for ids already gone from the store', async () => {
    const { deps, remove } = makeDeps()
    const id = newSid()
    const res = await handleAck(authed('/api/sync/ack', { body: { ids: [id] } }), deps)
    expect(await res.json()).toMatchObject({ deleted: 0, twilio: { removed: [id] } })
    expect(remove).toHaveBeenCalledWith(id)
  })

  it.each([
    ['missing ids', {}],
    ['empty ids', { ids: [] }],
    ['a non-SID id', { ids: ['inbox:index'] }],
    ['a non-string id', { ids: [123] }],
    ['too many ids', { ids: Array.from({ length: 101 }, () => newSid()) }],
  ])('returns 400 for %s', async (_label, body) => {
    const { deps, remove } = makeDeps()
    const res = await handleAck(authed('/api/sync/ack', { body }), deps)
    expect(res.status).toBe(400)
    expect(remove).not.toHaveBeenCalled()
  })
})
