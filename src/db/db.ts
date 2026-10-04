import Dexie, { type EntityTable } from 'dexie'
import type { Prototypes } from '../ai/analyze.ts'
import type { OutboxItem, SettingRow, VisitRecord } from './types.ts'

/** Prototype embeddings for one prototype set, so they are computed once per phone. */
export interface AiCacheRow {
  key: string
  prototypes: Prototypes
}

export const db = new Dexie('stepping-stones') as Dexie & {
  records: EntityTable<VisitRecord, 'record_id'>
  outbox: EntityTable<OutboxItem, 'id'>
  settings: EntityTable<SettingRow, 'key'>
  ai_cache: EntityTable<AiCacheRow, 'key'>
}

db.version(1).stores({
  records: 'record_id, received_at, review_status, created_from',
  outbox: 'id, created_at, status',
  settings: 'key',
})

db.version(2).stores({
  ai_cache: 'key',
})
