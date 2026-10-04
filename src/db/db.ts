import Dexie, { type EntityTable } from 'dexie'
import type { OutboxItem, SettingRow, VisitRecord } from './types.ts'

export const db = new Dexie('stepping-stones') as Dexie & {
  records: EntityTable<VisitRecord, 'record_id'>
  outbox: EntityTable<OutboxItem, 'id'>
  settings: EntityTable<SettingRow, 'key'>
}

db.version(1).stores({
  records: 'record_id, received_at, review_status, created_from',
  outbox: 'id, created_at, status',
  settings: 'key',
})
