import { createHmac } from 'node:crypto'

/**
 * sender_hash = HMAC-SHA256(SENDER_HMAC_SECRET, From in E.164), hex.
 * Callers must not keep the raw number after calling this.
 */
export function senderHash(secret: string, fromE164: string): string {
  if (!secret) throw new Error('SENDER_HMAC_SECRET is not set')
  return createHmac('sha256', secret).update(fromE164.trim()).digest('hex')
}
