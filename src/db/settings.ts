import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db.ts'
import type { SettingKey, Settings } from './types.ts'

export async function setSetting<K extends SettingKey>(key: K, value: Settings[K]): Promise<void> {
  await db.settings.put({ key, value })
}

export async function deleteSetting(key: SettingKey): Promise<void> {
  await db.settings.delete(key)
}

/** Live settings. Undefined while loading; missing keys are absent. */
export function useSettings(): Partial<Settings> | undefined {
  return useLiveQuery(async () => {
    const rows = await db.settings.toArray()
    return Object.fromEntries(rows.map((row) => [row.key, row.value])) as Partial<Settings>
  })
}

/** Asks the browser to keep this site's data when space runs low. Silent: the answer is not shown. */
export async function requestPersistentStorage(): Promise<void> {
  if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist()
}
