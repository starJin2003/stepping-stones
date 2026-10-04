import { createHash, timingSafeEqual } from 'node:crypto'

function bearerToken(authorizationHeader: string | null): string | null {
  const match = authorizationHeader?.match(/^Bearer\s+(\S+)\s*$/i)
  return match ? match[1] : null
}

/**
 * Checks `Authorization: Bearer <token>` against the expected SYNC_TOKEN in constant time.
 * Both sides are hashed first so the comparison is fixed-length and leaks neither content nor length.
 * Fails closed when no expected token is configured.
 */
export function isAuthorized(authorizationHeader: string | null, expectedToken: string): boolean {
  if (!expectedToken) return false
  const presented = bearerToken(authorizationHeader)
  if (presented === null) return false
  const a = createHash('sha256').update(presented).digest()
  const b = createHash('sha256').update(expectedToken).digest()
  return timingSafeEqual(a, b)
}
