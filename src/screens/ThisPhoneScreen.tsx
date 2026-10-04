import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { deleteModel, DOWNLOAD_BYTES, useModelStatus } from '../ai/client.ts'
import { toMB } from '../ai/model.ts'
import { SampleHistoryButtons } from '../components/SampleHistoryButtons.tsx'
import { db } from '../db/db.ts'
import { deleteSetting, setSetting, useSettings } from '../db/settings.ts'
import type { StoragePersistence } from '../db/types.ts'
import { useLanguage } from '../i18n/language.tsx'
import { countKey, type StringKey } from '../i18n/strings.ts'

const STORAGE_KEYS: Record<StoragePersistence, StringKey> = {
  granted: 'storage_granted',
  not_granted: 'storage_not_granted',
  unsupported: 'storage_unsupported',
}

export function ThisPhoneScreen() {
  const { t } = useLanguage()
  const settings = useSettings()
  const sampleCount = useLiveQuery(() => db.records.filter((r) => r.synthetic).count())

  return (
    <>
      <h1>{t('phone_title')}</h1>
      <SyncCode hasCode={Boolean(settings?.sync_token)} />
      <ServerAddress saved={settings?.server_url ?? ''} />
      <ModelSection />

      <section className="section" aria-labelledby="storage-title">
        <h2 id="storage-title">{t('storage_title')}</h2>
        <p>{t(settings?.storage_persisted ? STORAGE_KEYS[settings.storage_persisted] : 'storage_checking')}</p>
      </section>

      <section className="section" aria-labelledby="sample-title">
        <h2 id="sample-title">{t('sample_title')}</h2>
        <p>{t('sample_body')}</p>
        <p className="hint">
          {sampleCount
            ? t(countKey(sampleCount, 'sample_count_one', 'sample_count_other'), { n: sampleCount })
            : t('sample_none')}
        </p>
        <SampleHistoryButtons showRemove />
      </section>

      <section className="section" aria-labelledby="language-title">
        <h2 id="language-title">{t('language_title')}</h2>
        <p>{t('language_note')}</p>
      </section>
    </>
  )
}

function ModelSection() {
  const { t } = useLanguage()
  const model = useModelStatus()
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState<StringKey | null>(null)
  const mb = toMB(DOWNLOAD_BYTES)
  const onPhone = model.kind === 'ready' || model.kind === 'opening' || (model.kind === 'failed' && model.during === 'open')

  async function remove() {
    setConfirming(false)
    await deleteModel()
    setNotice('model_deleted')
  }

  return (
    <section className="section" aria-labelledby="model-section-title">
      <h2 id="model-section-title">{t('model_section_title')}</h2>
      <p>{onPhone ? t('model_on_phone', { mb }) : t('model_not_on_phone')}</p>
      {onPhone && !confirming && (
        <div>
          <button className="button button-secondary" type="button" onClick={() => setConfirming(true)}>
            {t('model_delete')}
          </button>
        </div>
      )}
      {onPhone && confirming && (
        <>
          <p className="lead">{t('model_delete_confirm', { mb })}</p>
          <div className="button-row">
            <button className="button button-primary" type="button" onClick={remove}>
              {t('model_delete_yes')}
            </button>
            <button className="button button-secondary" type="button" onClick={() => setConfirming(false)}>
              {t('model_delete_no')}
            </button>
          </div>
        </>
      )}
      <p className="notice" role="status">
        {notice && t(notice)}
      </p>
    </section>
  )
}

function ServerAddress({ saved }: { saved: string }) {
  const { t } = useLanguage()
  const [value, setValue] = useState<string | null>(null)
  const [notice, setNotice] = useState<StringKey | null>(null)
  const shown = value ?? saved

  async function save(event: FormEvent) {
    event.preventDefault()
    const address = shown.trim().replace(/\/+$/, '')
    if (address && !/^https?:\/\/[^\s/]+/.test(address)) {
      setNotice('server_invalid')
      return
    }
    await setSetting('server_url', address)
    setValue(null)
    setNotice(address ? 'server_saved' : 'server_cleared')
  }

  return (
    <section className="section" aria-labelledby="server-title">
      <h2 id="server-title">{t('server_title')}</h2>
      <form className="stack" onSubmit={save}>
        <p className="hint" id="server-hint">
          {t('server_hint')}
        </p>
        <input
          aria-labelledby="server-title"
          aria-describedby="server-hint"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={t('server_placeholder')}
          value={shown}
          onChange={(e) => setValue(e.target.value)}
        />
        <div>
          <button className="button button-secondary" type="submit">
            {t('server_save')}
          </button>
        </div>
        <p className="notice" role="status">
          {notice && t(notice)}
        </p>
      </form>
    </section>
  )
}

function SyncCode({ hasCode }: { hasCode: boolean }) {
  const { t } = useLanguage()
  const [value, setValue] = useState('')
  const [notice, setNotice] = useState<StringKey | null>(null)

  async function save(event: FormEvent) {
    event.preventDefault()
    const code = value.trim()
    if (!code) {
      setNotice('code_empty')
      return
    }
    await setSetting('sync_token', code)
    setValue('')
    setNotice('code_saved')
  }

  async function forget() {
    await deleteSetting('sync_token')
    setNotice('code_forgotten')
  }

  return (
    <section className="section" aria-labelledby="code-title">
      <h2 id="code-title">{t('code_title')}</h2>
      <p>{t(hasCode ? 'code_present' : 'code_missing')}</p>
      <form className="stack" onSubmit={save}>
        <label className="field-label" htmlFor="sync-code">
          {t(hasCode ? 'code_replace' : 'code_enter')}
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
            {t('code_save')}
          </button>
          {hasCode && (
            <button className="button button-secondary" type="button" onClick={forget}>
              {t('code_forget')}
            </button>
          )}
        </div>
        <p className="notice" role="status">
          {notice && t(notice)}
        </p>
      </form>
    </section>
  )
}
