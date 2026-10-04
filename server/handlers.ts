import { isAuthorized } from './auth.js'
import { senderHash } from './hmac.js'
import type { InboxStore } from './store.js'
import { errorInfo, isValidTwilioSignature, type TwilioMessaging } from './twilio.js'

export interface ServerConfig {
  twilioAuthToken: string
  publicBaseUrl: string
  senderHmacSecret: string
  syncToken: string
}

export interface Deps {
  config: ServerConfig
  store: InboxStore
  twilio: TwilioMessaging
}

export type Handler = (request: Request, deps: Deps) => Promise<Response>

const OPT_OUT_KEYWORDS = new Set(['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'STOPALL'])
const MESSAGE_SID = /^(SM|MM)[0-9a-fA-F]{32}$/
const MAX_ACK_IDS = 100
// Twilio's maximum message body length.
const MAX_OUTBOX_CHARS = 1600

export function inboundWebhookUrl(publicBaseUrl: string): string {
  return publicBaseUrl.replace(/\/+$/, '') + '/api/sms/inbound'
}

export function isOptOut(body: string): boolean {
  return OPT_OUT_KEYWORDS.has(body.trim().replace(/[.!]+$/, '').toUpperCase())
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

const unauthorized = () => json({ error: 'unauthorized' }, 401)

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json()
    return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** POST /api/sms/inbound (Twilio webhook) */
export const handleInbound: Handler = async (request, { config, store }) => {
  const params = Object.fromEntries(new URLSearchParams(await request.text()))
  // Sign against the public URL Twilio was configured with, not request.url, which differs behind Vercel's proxy.
  const url = inboundWebhookUrl(config.publicBaseUrl)
  if (!isValidTwilioSignature(config.twilioAuthToken, request.headers.get('x-twilio-signature'), url, params)) {
    return new Response('Forbidden', { status: 403 })
  }

  const { MessageSid: messageSid, From: from, Body: body = '', NumMedia: numMedia } = params
  if (!messageSid || !from) return new Response('Bad Request', { status: 400 })

  if (!isOptOut(body)) {
    await store.put({
      message_id: messageSid,
      sender_hash: senderHash(config.senderHmacSecret, from),
      received_at: new Date().toISOString(),
      channel: 'SMS',
      raw_text: body,
      num_media: Number.parseInt(numMedia ?? '0', 10) || 0,
    })
  }

  return new Response('<Response/>', { status: 200, headers: { 'content-type': 'text/xml' } })
}

/** GET /api/sync/pull */
export const handlePull: Handler = async (request, { config, store }) => {
  if (!isAuthorized(request.headers.get('authorization'), config.syncToken)) return unauthorized()
  return json({ records: await store.listPending() })
}

/** POST /api/sync/ack {ids} */
export const handleAck: Handler = async (request, { config, store, twilio }) => {
  if (!isAuthorized(request.headers.get('authorization'), config.syncToken)) return unauthorized()

  const ids = (await readJson(request))?.ids
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > MAX_ACK_IDS ||
    !ids.every((id): id is string => typeof id === 'string' && MESSAGE_SID.test(id))
  ) {
    return json({ error: `ids must be 1 to ${MAX_ACK_IDS} Twilio message SIDs` }, 400)
  }
  const uniqueIds = [...new Set(ids)]

  const deleted = await store.deleteMany(uniqueIds)

  // Twilio deletes run for every acked id, even ones no longer in Redis, so a retried ack can finish a failed delete.
  // A failure here is reported and does not undo the Redis delete.
  const results = await Promise.allSettled(uniqueIds.map((id) => twilio.removeMessage(id)))
  const removed: string[] = []
  const alreadyGone: string[] = []
  const failed: { id: string; status?: number; code?: number }[] = []
  results.forEach((result, i) => {
    const id = uniqueIds[i]
    if (result.status === 'rejected') {
      const { status, code } = errorInfo(result.reason)
      failed.push({ id, status, code })
    } else if (result.value === 'removed') {
      removed.push(id)
    } else {
      alreadyGone.push(id)
    }
  })
  if (failed.length > 0) console.error('twilio remove failed', failed)

  return json({ deleted, twilio: { removed, already_gone: alreadyGone, failed } })
}

/** POST /api/outbox/send {text} */
export const handleOutboxSend: Handler = async (request, { config, twilio }) => {
  if (!isAuthorized(request.headers.get('authorization'), config.syncToken)) return unauthorized()

  // Only `text` is read. Any recipient field in the body is ignored by construction.
  const text = (await readJson(request))?.text
  if (typeof text !== 'string' || text.trim() === '' || text.length > MAX_OUTBOX_CHARS) {
    return json({ error: `text must be a non-empty string of at most ${MAX_OUTBOX_CHARS} characters` }, 400)
  }

  try {
    const { sid, status } = await twilio.sendToNoor(text)
    return json({ sid, status })
  } catch (err) {
    const { status, code } = errorInfo(err)
    console.error('outbox send failed', { status, code })
    return json({ error: 'send_failed', status, code }, 502)
  }
}
