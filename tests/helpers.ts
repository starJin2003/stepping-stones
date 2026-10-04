import { randomBytes } from 'node:crypto'
import twilio from 'twilio'
import { vi } from 'vitest'
import type { Deps, ServerConfig } from '../server/handlers.js'
import { MemoryInboxStore, type InboxRecord } from '../server/store.js'
import { createTwilioMessaging, type TwilioClientLike } from '../server/twilio.js'

// Fake values only. No test touches the network or real credentials.
export const config: ServerConfig = {
  twilioAuthToken: 'test-auth-token-0123456789abcdef',
  publicBaseUrl: 'https://stepping-stones.example.com',
  senderHmacSecret: 'test-hmac-secret',
  syncToken: 'test-sync-token',
}
export const WEBHOOK_URL = 'https://stepping-stones.example.com/api/sms/inbound'
export const TWILIO_NUMBER = '+19595550100'
export const NOOR_NUMBER = '+821055550123'
export const TOURIST_NUMBER = '+15551234567'

export const newSid = (prefix = 'SM') => prefix + randomBytes(16).toString('hex')

export function makeDeps() {
  const store = new MemoryInboxStore()
  const remove = vi.fn(async (_sid: string) => true)
  const create = vi.fn(async (_params: { to: string; from: string; body: string }) => ({
    sid: newSid(),
    status: 'queued',
  }))
  const client: TwilioClientLike = {
    messages: Object.assign((sid: string) => ({ remove: () => remove(sid) }), { create }),
  }
  const deps: Deps = {
    config,
    store,
    twilio: createTwilioMessaging(client, { from: TWILIO_NUMBER, noor: NOOR_NUMBER }),
  }
  return { deps, store, remove, create }
}

/** Form params shaped like a real Twilio inbound SMS webhook. */
export function inboundParams(overrides: Record<string, string> = {}): Record<string, string> {
  const sid = overrides.MessageSid ?? newSid()
  return {
    ToCountry: 'US',
    SmsMessageSid: sid,
    NumMedia: '0',
    SmsSid: sid,
    SmsStatus: 'received',
    Body: "1) A friend at my hostel told me about Noor's coffee tour. 2) You can meet the farmer and taste her coffee.",
    To: TWILIO_NUMBER,
    NumSegments: '1',
    MessageSid: sid,
    AccountSid: 'AC' + '0'.repeat(32),
    From: TOURIST_NUMBER,
    FromCountry: 'US',
    ApiVersion: '2010-04-01',
    ...overrides,
  }
}

export function inboundRequest(
  params: Record<string, string>,
  { signature, url = WEBHOOK_URL }: { signature?: string | null; url?: string } = {},
): Request {
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' }
  const sig = signature === undefined ? twilio.getExpectedTwilioSignature(config.twilioAuthToken, WEBHOOK_URL, params) : signature
  if (sig !== null) headers['x-twilio-signature'] = sig
  return new Request(url, { method: 'POST', headers, body: new URLSearchParams(params).toString() })
}

export function authed(
  url: string,
  init: { method?: string; body?: unknown; token?: string | null } = {},
): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const token = init.token === undefined ? config.syncToken : init.token
  if (token !== null) headers.authorization = `Bearer ${token}`
  return new Request(`https://stepping-stones.example.com${url}`, {
    method: init.method ?? 'POST',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

export function record(overrides: Partial<InboxRecord> = {}): InboxRecord {
  return {
    message_id: newSid(),
    sender_hash: 'a'.repeat(64),
    received_at: new Date().toISOString(),
    channel: 'SMS',
    raw_text: '1) heard 2) would tell',
    num_media: 0,
    ...overrides,
  }
}
