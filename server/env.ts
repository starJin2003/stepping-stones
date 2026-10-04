import { Redis } from '@upstash/redis'
import twilio from 'twilio'
import { json, type Deps, type Handler } from './handlers.js'
import { UpstashInboxStore } from './store.js'
import { createTwilioMessaging, errorInfo } from './twilio.js'

const REQUIRED = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
  'NOOR_PHONE_NUMBER',
  'SENDER_HMAC_SECRET',
  'SYNC_TOKEN',
  'PUBLIC_BASE_URL',
]

let cached: Deps | undefined

/** Builds dependencies from process.env once per function instance. Throws listing missing variable names (never values). */
function getDeps(): Deps {
  if (cached) return cached
  const env = process.env
  // The Vercel Marketplace integration may use either naming.
  const redisUrl = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL
  const redisToken = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN

  const missing = REQUIRED.filter((name) => !env[name])
  if (!redisUrl) missing.push('KV_REST_API_URL or UPSTASH_REDIS_REST_URL')
  if (!redisToken) missing.push('KV_REST_API_TOKEN or UPSTASH_REDIS_REST_TOKEN')
  if (missing.length > 0) throw new Error(`Missing environment variables: ${missing.join(', ')}`)

  const value = (name: string) => env[name] as string
  cached = {
    config: {
      twilioAuthToken: value('TWILIO_AUTH_TOKEN'),
      publicBaseUrl: value('PUBLIC_BASE_URL'),
      senderHmacSecret: value('SENDER_HMAC_SECRET'),
      syncToken: value('SYNC_TOKEN'),
    },
    store: new UpstashInboxStore(new Redis({ url: redisUrl as string, token: redisToken as string })),
    twilio: createTwilioMessaging(twilio(value('TWILIO_ACCOUNT_SID'), value('TWILIO_AUTH_TOKEN')), {
      from: value('TWILIO_PHONE_NUMBER'),
      noor: value('NOOR_PHONE_NUMBER'),
    }),
  }
  return cached
}

/** Wraps a handler for an api/ entrypoint. Errors are logged without messages, which could contain phone numbers or text. */
export function route(handler: Handler): (request: Request) => Promise<Response> {
  return async (request) => {
    let deps: Deps
    try {
      deps = getDeps()
    } catch (err) {
      // This message is ours and lists variable names only.
      console.error(err instanceof Error ? err.message : 'configuration error')
      return json({ error: 'server_misconfigured' }, 500)
    }
    try {
      return await handler(request, deps)
    } catch (err) {
      console.error('unhandled error', errorInfo(err))
      return json({ error: 'internal_error' }, 500)
    }
  }
}
