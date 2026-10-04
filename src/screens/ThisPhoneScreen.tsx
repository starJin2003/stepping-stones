import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { SampleHistoryButtons } from '../components/SampleHistoryButtons.tsx'
import { db } from '../db/db.ts'
import { deleteSetting, setSetting, useSettings } from '../db/settings.ts'
import type { StoragePersistence } from '../db/types.ts'

const STORAGE_WORDS: Record<StoragePersistence, string> = {
  granted: 'Kept. The browser will not clear messages on this phone to free up space.',
  not_granted:
    'Not guaranteed. The browser may clear messages if the phone runs low on space. Adding the app to the home screen usually changes this.',
  unsupported: 'This browser cannot promise to keep messages when space runs low.',
}

export function ThisPhoneScreen() {
  const settings = useSettings()
  const sampleCount = useLiveQuery(() => db.records.filter((r) => r.synthetic).count())

  return (
    <>
      <h1>This phone</h1>
      <ServerAddress saved={settings?.server_url ?? ''} />
      <SyncCode hasCode={Boolean(settings?.sync_token)} />

      <section className="section" aria-labelledby="storage-title">
        <h2 id="storage-title">Storage</h2>
        <p>{settings?.storage_persisted ? STORAGE_WORDS[settings.storage_persisted] : 'Checking.'}</p>
      </section>

      <section className="section" aria-labelledby="sample-title">
        <h2 id="sample-title">Sample history</h2>
        <p>
          Sample history is synthetic: made-up past visits that show how linking works. Removing it deletes only the
          sample messages.
        </p>
        <p className="hint">
          {sampleCount ? `${sampleCount} sample messages on this phone.` : 'No sample history on this phone.'}
        </p>
        <SampleHistoryButtons showRemove />
      </section>
    </>
  )
}

function ServerAddress({ saved }: { saved: string }) {
  const [value, setValue] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const shown = value ?? saved

  async function save(event: FormEvent) {
    event.preventDefault()
    const address = shown.trim().replace(/\/+$/, '')
    if (address && !/^https?:\/\/[^\s/]+/.test(address)) {
      setNotice('Enter a full address starting with https://, or leave it empty.')
      return
    }
    await setSetting('server_url', address)
    setValue(null)
    setNotice(address ? 'Server address saved.' : 'This phone will use this site.')
  }

  return (
    <section className="section" aria-labelledby="server-title">
      <h2 id="server-title">Server address</h2>
      <form className="stack" onSubmit={save}>
        <p className="hint" id="server-hint">
          Leave empty to use this site.
        </p>
        <input
          aria-labelledby="server-title"
          aria-describedby="server-hint"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="Same as this site"
          value={shown}
          onChange={(e) => setValue(e.target.value)}
        />
        <div>
          <button className="button button-secondary" type="submit">
            Save address
          </button>
        </div>
        <p className="notice" role="status">
          {notice}
        </p>
      </form>
    </section>
  )
}

function SyncCode({ hasCode }: { hasCode: boolean }) {
  const [value, setValue] = useState('')
  const [notice, setNotice] = useState('')

  async function save(event: FormEvent) {
    event.preventDefault()
    const code = value.trim()
    if (!code) {
      setNotice('Type the sync code first.')
      return
    }
    await setSetting('sync_token', code)
    setValue('')
    setNotice('Sync code saved on this phone.')
  }

  async function forget() {
    await deleteSetting('sync_token')
    setNotice('Sync code forgotten. Add it again to get new messages.')
  }

  return (
    <section className="section" aria-labelledby="code-title">
      <h2 id="code-title">Sync code</h2>
      <p>{hasCode ? 'A sync code is saved on this phone.' : 'No sync code saved yet. Without it, this phone cannot get new messages.'}</p>
      <form className="stack" onSubmit={save}>
        <label className="field-label" htmlFor="sync-code">
          {hasCode ? 'Replace the sync code' : 'Enter the sync code'}
        </label>
        <input
          id="sync-code"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="button-row">
          <button className="button button-primary" type="submit">
            Save sync code
          </button>
          {hasCode && (
            <button className="button button-secondary" type="button" onClick={forget}>
              Forget sync code
            </button>
          )}
        </div>
        <p className="notice" role="status">
          {notice}
        </p>
      </form>
    </section>
  )
}
