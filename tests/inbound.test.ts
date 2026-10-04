import twilio from 'twilio'
import { describe, expect, it } from 'vitest'
import { handleInbound } from '../server/handlers.js'
import { senderHash } from '../server/hmac.js'
import { config, inboundParams, inboundRequest, makeDeps, TOURIST_NUMBER } from './helpers.js'

describe('POST /api/sms/inbound', () => {
  it('stores a validly signed SMS with sender_hash and no trace of the raw From number', async () => {
    const { deps, store } = makeDeps()
    const params = inboundParams()

    const res = await handleInbound(inboundRequest(params), deps)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/xml')
    expect(await res.text()).toBe('<Response/>')

    const records = await store.listPending()
    expect(records).toHaveLength(1)
    const [stored] = records
    expect(stored).toEqual({
      message_id: params.MessageSid,
      sender_hash: senderHash(config.senderHmacSecret, TOURIST_NUMBER),
      received_at: expect.any(String),
      channel: 'SMS',
      raw_text: params.Body,
      num_media: 0,
    })
    expect(stored.sender_hash).toMatch(/^[0-9a-f]{64}$/)

    const serialized = JSON.stringify(records)
    expect(serialized).not.toContain(TOURIST_NUMBER)
    expect(serialized).not.toContain(TOURIST_NUMBER.replace('+', ''))
    expect(serialized).not.toContain(TOURIST_NUMBER.slice(-10))
  })

  it('validates against PUBLIC_BASE_URL, not the URL the request arrived on', async () => {
    const { deps, store } = makeDeps()
    const res = await handleInbound(
      inboundRequest(inboundParams(), { url: 'http://internal-host:3000/api/sms/inbound' }),
      { ...deps, config: { ...config, publicBaseUrl: config.publicBaseUrl + '/' } },
    )
    expect(res.status).toBe(200)
    expect(await store.listPending()).toHaveLength(1)
  })

  it.each([
    ['signed with the wrong auth token', (p: Record<string, string>) =>
      inboundRequest(p, { signature: twilio.getExpectedTwilioSignature('wrong-token', 'https://stepping-stones.example.com/api/sms/inbound', p) })],
    ['signed for a different URL', (p: Record<string, string>) =>
      inboundRequest(p, { signature: twilio.getExpectedTwilioSignature(config.twilioAuthToken, 'https://evil.example.com/api/sms/inbound', p) })],
    ['missing the signature header', (p: Record<string, string>) => inboundRequest(p, { signature: null })],
    ['with a garbage signature', (p: Record<string, string>) => inboundRequest(p, { signature: 'bm90IGEgc2lnbmF0dXJl' })],
  ])('returns 403 and stores nothing when %s', async (_label, build) => {
    const { deps, store } = makeDeps()
    const res = await handleInbound(build(inboundParams()), deps)
    expect(res.status).toBe(403)
    expect(await store.listPending()).toEqual([])
  })

  it('returns 403 when the body was tampered with after signing', async () => {
    const { deps, store } = makeDeps()
    const params = inboundParams()
    const signature = twilio.getExpectedTwilioSignature(config.twilioAuthToken, 'https://stepping-stones.example.com/api/sms/inbound', params)
    const res = await handleInbound(inboundRequest({ ...params, Body: 'tampered' }, { signature }), deps)
    expect(res.status).toBe(403)
    expect(await store.listPending()).toEqual([])
  })

  it('keeps one record when Twilio retries the same MessageSid', async () => {
    const { deps, store } = makeDeps()
    const params = inboundParams()

    const first = await handleInbound(inboundRequest(params), deps)
    const retry = await handleInbound(inboundRequest(params), deps)
    const sameSidOtherBody = await handleInbound(inboundRequest({ ...params, Body: 'different body' }), deps)

    expect([first.status, retry.status, sameSidOtherBody.status]).toEqual([200, 200, 200])
    const records = await store.listPending()
    expect(records).toHaveLength(1)
    expect(records[0].raw_text).toBe(params.Body)
  })

  it.each(['STOP', 'stop', ' Stop ', 'STOP.', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'STOPALL', 'stopall!'])(
    'does not store the opt-out keyword %j but still answers with empty TwiML',
    async (body) => {
      const { deps, store } = makeDeps()
      const res = await handleInbound(inboundRequest(inboundParams({ Body: body })), deps)
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('<Response/>')
      expect(await store.listPending()).toEqual([])
    },
  )

  it('stores messages that merely contain an opt-out word', async () => {
    const { deps, store } = makeDeps()
    await handleInbound(inboundRequest(inboundParams({ Body: "1) A guide. 2) Don't stop at the first farm, come here" })), deps)
    expect(await store.listPending()).toHaveLength(1)
  })

  it('records num_media but never media URLs', async () => {
    const { deps, store } = makeDeps()
    const params = inboundParams({
      NumMedia: '1',
      MediaUrl0: 'https://api.twilio.com/2010-04-01/Accounts/AC0/Messages/MM0/Media/ME0',
      MediaContentType0: 'image/jpeg',
    })
    await handleInbound(inboundRequest(params), deps)
    const records = await store.listPending()
    expect(records[0].num_media).toBe(1)
    expect(JSON.stringify(records)).not.toContain('api.twilio.com')
  })
})
