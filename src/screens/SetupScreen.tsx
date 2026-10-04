import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { deleteModel, DOWNLOAD_BYTES, useModelStatus } from '../ai/client.ts'
import { toMB } from '../ai/model.ts'
import { ModelCard } from '../components/ModelCard.tsx'
import { SampleHistoryButtons } from '../components/SampleHistoryButtons.tsx'
import { db } from '../db/db.ts'
import { deleteSetting, setSetting, useSettings } from '../db/settings.ts'
import { useLanguage } from '../i18n/language.tsx'
import { countKey, LANGUAGE_NAMES, type Lang, type StringKey } from '../i18n/strings.ts'

/** Setup, in three groups: what the family sets up once, language, and demo tools. */
export function SetupScreen() {
  const { t } = useLanguage()
  const settings = useSettings()

  return (
    <>
      <h1>{t('setup')}</h1>

      <section className="group" aria-labelledby="setup-title">
        <h2 id="setup-title">{t('group_setup')}</h2>
        <SyncCode hasCode={Boolean(settings?.sync_token)} />
        <ModelSection />
      </section>

      <section className="group" aria-labelledby="language-title">
        <h2 id="language-title">{t('language_title')}</h2>
        <LanguageChoice />
      </section>

      <section className="group" aria-labelledby="demo-title">
        <h2 id="demo-title">{t('group_demo')}</h2>
        <SampleHistory />
      </section>
    </>
  )
}

function LanguageChoice() {
  const { lang, t, setLang } = useLanguage()
  return (
    <div className="stack">
      <div className="choice-row" role="group" aria-label={t('language_label')}>
        {(Object.keys(LANGUAGE_NAMES) as Lang[]).map((code) => (
          <button
            key={code}
            className={lang === code ? 'button button-primary' : 'button button-secondary'}
            type="button"
            lang={code}
            aria-pressed={lang === code}
            onClick={() => setLang(code)}
          >
            {LANGUAGE_NAMES[code]}
          </button>
        ))}
      </div>
      <p className="hint">{t('language_note')}</p>
    </div>
  )
}

function SampleHistory() {
  const { t } = useLanguage()
  const sampleCount = useLiveQuery(() => db.records.filter((r) => r.synthetic).count())
  return (
    <div className="subgroup">
      <h3>{t('sample_title')}</h3>
      <p>{t('sample_body')}</p>
      <p className="hint">
        {sampleCount ? t(countKey(sampleCount, 'sample_count_one', 'sample_count_other'), { n: sampleCount }) : t('sample_none')}
      </p>
      <SampleHistoryButtons showRemove />
    </div>
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

  if (!onPhone) {
    return (
      <div className="subgroup">
        <ModelCard heading="h3" />
        <p className="notice" role="status">
          {notice && t(notice)}
        </p>
      </div>
    )
  }

  return (
    <div className="subgroup">
      <h3>{t('model_section_title')}</h3>
      <p>{t('model_on_phone', { mb })}</p>
      {!confirming && (
        <div>
          <button className="button button-secondary" type="button" onClick={() => setConfirming(true)}>
            {t('model_delete')}
          </button>
        </div>
      )}
      {confirming && (
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
    </div>
  )
}

/** With a code saved, only Change and Forget show; the input appears when a person wants to type one. */
function SyncCode({ hasCode }: { hasCode: boolean }) {
  const { t } = useLanguage()
  const [value, setValue] = useState('')
  const [changing, setChanging] = useState(false)
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
    setChanging(false)
    setNotice(null)
  }

  async function forget() {
    await deleteSetting('sync_token')
    setChanging(false)
    setNotice('code_forgotten')
  }

  const status = (
    <p className="notice" role="status">
      {notice && t(notice)}
    </p>
  )

  if (hasCode && !changing) {
    return (
      <div className="subgroup">
        <h3>{t('code_title')}</h3>
        <p>{t('code_present')}</p>
        <div className="button-row">
          <button className="button button-secondary" type="button" onClick={() => setChanging(true)}>
            {t('code_change')}
          </button>
          <button className="button button-secondary" type="button" onClick={forget}>
            {t('code_forget')}
          </button>
        </div>
        {status}
      </div>
    )
  }

  return (
    <div className="subgroup">
      <h3>{t('code_title')}</h3>
      {!hasCode && <p>{t('code_missing')}</p>}
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
            <button className="button button-secondary" type="button" onClick={() => setChanging(false)}>
              {t('code_cancel')}
            </button>
          )}
        </div>
        {status}
      </form>
    </div>
  )
}
