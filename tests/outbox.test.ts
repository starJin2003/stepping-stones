import { describe, expect, it } from 'vitest'
import { handleOutboxSend } from '../server/handlers.js'
import { authed, makeDeps, NOOR_NUMBER, TWILIO_NUMBER } from './helpers.js'

// Placeholder text with Gĩkũyũ characters, not a real template.
const SUMMARY = 'Test summary 7/5 ĩ ũ Ĩ Ũ'

describe('POST /api/outbox/send', () => {
  it('ignores any recipient in the request body and always sends to NOOR_PHONE_NUMBER', async () => {
    const { deps, create } = makeDeps()
    const res = await handleOutboxSend(
      authed('/api/outbox/send', {
        body: { text: SUMMARY, to: '+15550001111', To: '+15550002222', recipient: '+15550003333', phone: '+15550004444' },
      }),
      deps,
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sid: expect.stringMatching(/^SM[0-9a-f]{32}$/), status: 'queued' })
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith({ to: NOOR_NUMBER, from: TWILIO_NUMBER, body: SUMMARY })
  })

  it('does not store the text', async () => {
    const { deps, store } = makeDeps()
    await handleOutboxSend(authed('/api/outbox/send', { body: { text: SUMMARY } }), deps)
    expect(await store.listPending()).toEqual([])
  })

  it('requires the sync token', async () => {
    const { deps, create } = makeDeps()
    const res = await handleOutboxSend(authed('/api/outbox/send', { token: 'wrong', body: { text: SUMMARY } }), deps)
    expect(res.status).toBe(401)
    expect(create).not.toHaveBeenCalled()
  })

  it.each([['missing text', {}], ['blank text', { text: '   ' }], ['non-string text', { text: 42 }], ['text over 1600 chars', { text: 'a'.repeat(1601) }]])(
    'returns 400 for %s',
    async (_label, body) => {
      const { deps, create } = makeDeps()
      const res = await handleOutboxSend(authed('/api/outbox/send', { body }), deps)
      expect(res.status).toBe(400)
      expect(create).not.toHaveBeenCalled()
    },
  )

  it('returns 502 with only the Twilio error code when sending fails', async () => {
    const { deps, create } = makeDeps()
    create.mockRejectedValueOnce(
      Object.assign(new Error(`The 'To' number ${NOOR_NUMBER} is not a valid phone number.`), { status: 400, code: 21211 }),
    )
    const res = await handleOutboxSend(authed('/api/outbox/send', { body: { text: SUMMARY } }), deps)
    expect(res.status).toBe(502)
    const body = await res.text()
    expect(JSON.parse(body)).toEqual({ error: 'send_failed', status: 400, code: 21211 })
    expect(body).not.toContain(NOOR_NUMBER)
  })
})
