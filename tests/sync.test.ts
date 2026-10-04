import { describe, expect, it, vi } from 'vitest'
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

  it.each(BAD_TOKENS)('ack returns 401 with %s and touches nothing', async (_label, token) => {
    const { deps, store, update, remove } = makeDeps()
    const r = record()
    await store.put(r)
    const res = await handleAck(authed('/api/sync/ack', { token, body: { ids: [r.message_id] } }), deps)
    expect(res.status).toBe(401)
    expect(await store.listPending()).toHaveLength(1)
    expect(update).not.toHaveBeenCalled()
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

const twilioError = (status: number, code: number, message = 'Twilio error') => Object.assign(new Error(message), { status, code })

/** Position of the call for `sid` in vitest's global call order. */
function callOrder(mock: { mock: { calls: unknown[][]; invocationCallOrder: number[] } }, sid: string): number {
  const index = mock.mock.calls.findIndex(([calledSid]) => calledSid === sid)
  expect(index, `no call for ${sid}`).toBeGreaterThanOrEqual(0)
  return mock.mock.invocationCallOrder[index]
}

describe('POST /api/sync/ack', () => {
  it('deletes acked records from the store, then redacts and removes each one in Twilio', async () => {
    const { deps, store, update, remove } = makeDeps()
    const a = record()
    const b = record()
    const keep = record()
    await Promise.all([store.put(a), store.put(b), store.put(keep)])

    const res = await handleAck(authed('/api/sync/ack', { body: { ids: [a.message_id, b.message_id] } }), deps)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      deleted: 2,
      twilio: {
        redacted: [a.message_id, b.message_id],
        removed: [a.message_id, b.message_id],
        already_gone: [],
        failed: [],
      },
    })
    expect(await store.listPending()).toEqual([keep])
    expect(update).toHaveBeenCalledTimes(2)
    expect(remove).toHaveBeenCalledTimes(2)
  })

  it('redacts with exactly { body: "" } and only then removes, for each id', async () => {
    const { deps, update, remove } = makeDeps()
    const ids = [newSid(), newSid(), newSid('MM')]

    await handleAck(authed('/api/sync/ack', { body: { ids } }), deps)

    expect(update.mock.calls.map(([, params]) => params)).toStrictEqual([{ body: '' }, { body: '' }, { body: '' }])
    for (const id of ids) {
      expect(callOrder(update, id)).toBeLessThan(callOrder(remove, id))
    }
  })

  it('runs ids in parallel, waits for each redact before its remove, and reports ids in request order', async () => {
    const { deps, update, remove } = makeDeps()
    const [a, b] = [newSid(), newSid()]
    const release: Record<string, () => void> = {}
    update.mockImplementation((sid) => new Promise((resolve) => (release[sid] = () => resolve({}))))

    const pending = handleAck(authed('/api/sync/ack', { body: { ids: [a, b] } }), deps)
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(2))
    expect(remove).not.toHaveBeenCalled()

    release[b]()
    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith(b))
    expect(remove).not.toHaveBeenCalledWith(a)
    release[a]()

    expect(await (await pending).json()).toMatchObject({ twilio: { redacted: [a, b], removed: [a, b] } })
  })

  it('treats a 404 on redact as already gone and does not call remove', async () => {
    const { deps, update, remove } = makeDeps()
    const id = newSid()
    update.mockRejectedValueOnce(twilioError(404, 20404))

    const res = await handleAck(authed('/api/sync/ack', { body: { ids: [id] } }), deps)

    expect(await res.json()).toEqual({
      deleted: 0,
      twilio: { redacted: [], removed: [], already_gone: [id], failed: [] },
    })
    expect(remove).not.toHaveBeenCalled()
  })

  it('still removes after a failed redact and reports the redact failure', async () => {
    const { deps, store, update, remove } = makeDeps()
    const r = record()
    await store.put(r)
    update.mockRejectedValueOnce(twilioError(503, 20503))

    const res = await handleAck(authed('/api/sync/ack', { body: { ids: [r.message_id] } }), deps)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      deleted: 1,
      twilio: {
        redacted: [],
        removed: [r.message_id],
        already_gone: [],
        failed: [{ id: r.message_id, step: 'redact', status: 503, code: 20503 }],
      },
    })
    expect(remove).toHaveBeenCalledWith(r.message_id)
    expect(await store.listPending()).toEqual([])
  })

  it('reports a failed remove after a successful redact', async () => {
    const { deps, remove } = makeDeps()
    const id = newSid()
    remove.mockRejectedValueOnce(twilioError(503, 20503))

    const res = await handleAck(authed('/api/sync/ack', { body: { ids: [id] } }), deps)

    expect(await res.json()).toEqual({
      deleted: 0,
      twilio: {
        redacted: [id],
        removed: [],
        already_gone: [],
        failed: [{ id, step: 'remove', status: 503, code: 20503 }],
      },
    })
  })

  it('sorts a mixed batch into buckets in request order without undoing the store delete', async () => {
    const { deps, store, update, remove } = makeDeps()
    const [ok, removeFails, gone, bothFail] = [record(), record(), record(), record()]
    await Promise.all([ok, removeFails, gone, bothFail].map((r) => store.put(r)))
    update.mockImplementation(async (sid) => {
      if (sid === gone.message_id) throw twilioError(404, 20404)
      if (sid === bothFail.message_id) throw twilioError(500, 20500)
      return {}
    })
    remove.mockImplementation(async (sid) => {
      if (sid === removeFails.message_id || sid === bothFail.message_id) throw twilioError(503, 20503)
      return true
    })

    const ids = [ok, removeFails, gone, bothFail].map((r) => r.message_id)
    const res = await handleAck(authed('/api/sync/ack', { body: { ids } }), deps)

    expect(await res.json()).toEqual({
      deleted: 4,
      twilio: {
        redacted: [ok.message_id, removeFails.message_id],
        removed: [ok.message_id],
        already_gone: [gone.message_id],
        failed: [
          { id: removeFails.message_id, step: 'remove', status: 503, code: 20503 },
          { id: bothFail.message_id, step: 'redact', status: 500, code: 20500 },
          { id: bothFail.message_id, step: 'remove', status: 503, code: 20503 },
        ],
      },
    })
    expect(await store.listPending()).toEqual([])
  })

  it('never puts a Twilio error message in the response or the logs', async () => {
    const { deps, update, remove } = makeDeps()
    const phone = '+15551234567'
    const leaky = `Message from ${phone}: 1) my friend told me 2) great coffee`
    update.mockRejectedValueOnce(twilioError(400, 21610, leaky))
    remove.mockRejectedValueOnce(twilioError(400, 21610, leaky))
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const res = await handleAck(authed('/api/sync/ack', { body: { ids: [newSid()] } }), deps)
      const body = await res.text()
      expect(body).not.toContain(phone)
      expect(body).not.toContain('great coffee')
      expect(logged).toHaveBeenCalled()
      const logs = JSON.stringify(logged.mock.calls)
      expect(logs).not.toContain(phone)
      expect(logs).not.toContain('great coffee')
    } finally {
      logged.mockRestore()
    }
  })

  it('runs both Twilio steps on a retried ack for an id no longer in the store', async () => {
    const { deps, update, remove } = makeDeps()
    const id = newSid()

    const res = await handleAck(authed('/api/sync/ack', { body: { ids: [id] } }), deps)

    expect(await res.json()).toEqual({
      deleted: 0,
      twilio: { redacted: [id], removed: [id], already_gone: [], failed: [] },
    })
    expect(update).toHaveBeenCalledWith(id, { body: '' })
    expect(remove).toHaveBeenCalledWith(id)
  })

  it.each([
    ['missing ids', {}],
    ['empty ids', { ids: [] }],
    ['a non-SID id', { ids: ['inbox:index'] }],
    ['a non-string id', { ids: [123] }],
    ['too many ids', { ids: Array.from({ length: 101 }, () => newSid()) }],
  ])('returns 400 for %s', async (_label, body) => {
    const { deps, update, remove } = makeDeps()
    const res = await handleAck(authed('/api/sync/ack', { body }), deps)
    expect(res.status).toBe(400)
    expect(update).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })
})
