import type { Redis } from '@upstash/redis'

export const INBOX_TTL_SECONDS = 14 * 24 * 60 * 60

/** Temporary transport record. Never holds the raw phone number or media URLs. */
export interface InboxRecord {
  message_id: string
  sender_hash: string
  received_at: string
  channel: 'SMS'
  raw_text: string
  num_media: number
}

export interface InboxStore {
  /** Stores the record unless one with the same message_id exists (first write wins). Returns true if newly stored. */
  put(record: InboxRecord): Promise<boolean>
  /** All unexpired records, oldest first. */
  listPending(): Promise<InboxRecord[]>
  /** Deletes the given ids. Returns how many existed. */
  deleteMany(ids: string[]): Promise<number>
}

const RECORD_PREFIX = 'inbox:msg:'
// Sorted set of message ids scored by received_at, so pull needs no SCAN.
const INDEX_KEY = 'inbox:index'

const recordKey = (id: string) => RECORD_PREFIX + id

export class UpstashInboxStore implements InboxStore {
  private readonly redis: Redis

  constructor(redis: Redis) {
    this.redis = redis
  }

  async put(record: InboxRecord): Promise<boolean> {
    // Every step is idempotent, so a Twilio retry after a partial failure repairs the index.
    const [setResult] = await this.redis
      .pipeline()
      .set(recordKey(record.message_id), record, { nx: true, ex: INBOX_TTL_SECONDS })
      .zadd(INDEX_KEY, { nx: true }, { score: Date.parse(record.received_at), member: record.message_id })
      // The index outlives every record it points to; expired ids are pruned on read.
      .expire(INDEX_KEY, INBOX_TTL_SECONDS)
      .exec()
    return setResult === 'OK'
  }

  async listPending(): Promise<InboxRecord[]> {
    const ids = await this.redis.zrange<string[]>(INDEX_KEY, 0, -1)
    if (ids.length === 0) return []
    const records = await this.redis.mget<(InboxRecord | null)[]>(...ids.map(recordKey))
    const expired = ids.filter((_, i) => records[i] === null)
    if (expired.length > 0) await this.redis.zrem(INDEX_KEY, ...expired)
    return records.filter((r): r is InboxRecord => r !== null)
  }

  async deleteMany(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0
    const [deleted] = await this.redis
      .pipeline()
      .del(...ids.map(recordKey))
      .zrem(INDEX_KEY, ...ids)
      .exec<[number, number]>()
    return deleted
  }
}

/** Same contract as UpstashInboxStore, for tests. */
export class MemoryInboxStore implements InboxStore {
  private readonly records = new Map<string, { record: InboxRecord; expiresAt: number }>()
  private readonly now: () => number

  constructor(now: () => number = Date.now) {
    this.now = now
  }

  async put(record: InboxRecord): Promise<boolean> {
    this.dropExpired()
    if (this.records.has(record.message_id)) return false
    this.records.set(record.message_id, {
      record: structuredClone(record),
      expiresAt: this.now() + INBOX_TTL_SECONDS * 1000,
    })
    return true
  }

  async listPending(): Promise<InboxRecord[]> {
    this.dropExpired()
    return [...this.records.values()]
      .map((entry) => structuredClone(entry.record))
      .sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at))
  }

  async deleteMany(ids: string[]): Promise<number> {
    this.dropExpired()
    let deleted = 0
    for (const id of new Set(ids)) if (this.records.delete(id)) deleted++
    return deleted
  }

  private dropExpired() {
    const now = this.now()
    for (const [id, entry] of this.records) if (entry.expiresAt <= now) this.records.delete(id)
  }
}
