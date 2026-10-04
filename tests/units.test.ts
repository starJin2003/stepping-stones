import { describe, expect, it } from 'vitest'
import { isAuthorized } from '../server/auth.js'
import { senderHash } from '../server/hmac.js'
import { INBOX_TTL_SECONDS, MemoryInboxStore } from '../server/store.js'
import { record } from './helpers.js'

describe('senderHash', () => {
  it('is a stable hex HMAC that depends on the secret', () => {
    const a = senderHash('secret-1', '+15551234567')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(senderHash('secret-1', '+15551234567')).toBe(a)
    expect(senderHash('secret-2', '+15551234567')).not.toBe(a)
    expect(senderHash('secret-1', '+15551234568')).not.toBe(a)
  })

  it('refuses to hash without a secret', () => {
    expect(() => senderHash('', '+15551234567')).toThrow()
  })
})

describe('isAuthorized', () => {
  it.each([
    ['Bearer s3cret', true],
    ['bearer s3cret', true],
    ['Bearer  s3cret ', true],
    ['Bearer s3cre', false],
    ['Bearer s3cret-and-more', false],
    ['s3cret', false],
    ['Bearer ', false],
    ['Basic s3cret', false],
  ])('%j -> %s', (header, expected) => {
    expect(isAuthorized(header, 's3cret')).toBe(expected)
  })

  it('fails closed without a configured token', () => {
    expect(isAuthorized('Bearer ', '')).toBe(false)
    expect(isAuthorized(null, '')).toBe(false)
  })
})

describe('MemoryInboxStore', () => {
  it('expires records after 14 days', async () => {
    let now = Date.parse('2026-09-01T00:00:00Z')
    const store = new MemoryInboxStore(() => now)
    await store.put(record())
    now += INBOX_TTL_SECONDS * 1000 - 1
    expect(await store.listPending()).toHaveLength(1)
    now += 1
    expect(await store.listPending()).toHaveLength(0)
  })

  it('put is idempotent and deleteMany counts only existing ids', async () => {
    const store = new MemoryInboxStore()
    const r = record()
    expect(await store.put(r)).toBe(true)
    expect(await store.put({ ...r, raw_text: 'changed' })).toBe(false)
    expect(await store.deleteMany([r.message_id, r.message_id, 'SMmissing'])).toBe(1)
    expect(await store.listPending()).toEqual([])
  })
})
