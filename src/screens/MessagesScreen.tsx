import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState, type FormEvent } from 'react'
import { SampleHistoryButtons } from '../components/SampleHistoryButtons.tsx'
import { db } from '../db/db.ts'
import { addPastedMessage, MAX_PASTE_CHARS, saveNewRecords } from '../db/records.ts'
import { useSettings } from '../db/settings.ts'
import { useLanguage } from '../i18n/language.tsx'
import { countKey } from '../i18n/strings.ts'
import { reviewWords, sourceWords, visitorLabels } from '../lib/visitors.ts'
import { operator } from '../operator/active.ts'
import { getNewMessages, syncMessage } from '../sync/sync.ts'

export function MessagesScreen() {
  const { lang, t } = useLanguage()
  const records = useLiveQuery(() => db.records.orderBy('received_at').reverse().toArray())
  const settings = useSettings()
  const [syncing, setSyncing] = useState(false)
  const [syncNotice, setSyncNotice] = useState('')
  const labels = useMemo(() => visitorLabels(records ?? [], lang), [records, lang])

  // The to-do: real messages a person has not checked yet. Sample history never counts.
  const toCheck = records?.filter((r) => r.review_status === 'Pending' && !r.synthetic).length

  async function sync() {
    setSyncing(true)
    setSyncNotice('')
    const result = await getNewMessages({
      fetch: window.fetch.bind(window),
      store: { saveNew: saveNewRecords },
      serverUrl: settings?.server_url ?? '',
      syncToken: settings?.sync_token ?? '',
      isOnline: () => navigator.onLine,
    })
    setSyncNotice(syncMessage(result, lang))
    setSyncing(false)
  }

  return (
    <>
      {toCheck !== undefined && (
        <h1 className={toCheck > 0 ? 'todo' : 'todo todo-done'}>
          {toCheck > 0 ? t(countKey(toCheck, 'todo_one', 'todo_other'), { n: toCheck }) : t('todo_none')}
        </h1>
      )}

      <div className="stack">
        <button className="button button-primary button-main" type="button" onClick={sync} disabled={syncing}>
          {syncing ? t('syncing') : t('sync')}
        </button>
        <p className="notice" role="status">
          {syncNotice}
        </p>
        <PasteBox />
      </div>

      {records && records.length === 0 && (
        <div className="stack">
          <p className="lead">{t('empty_title')}</p>
          <p>{t('empty_body')}</p>
          <SampleHistoryButtons showRemove={false} />
        </div>
      )}

      {records && records.length > 0 && (
        <ol className="messages" aria-label={t('list_label')}>
          {records.map((r) => (
            <li className="message" key={r.record_id}>
              <h2>{labels.get(r.record_id)}</h2>
              {/* Exactly as the visitor wrote it, in whatever language: never translated. */}
              <blockquote className="sms" lang="">
                {r.raw_text_local}
              </blockquote>
              <div className="message-meta">
                <p>{sourceWords(r, lang)}</p>
                <p className={`status status-${r.review_status.toLowerCase()}`}>{reviewWords(r, labels, lang)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

function PasteBox() {
  const { lang, t } = useLanguage()
  const [text, setText] = useState('')
  const [notice, setNotice] = useState('')
  const [first, second] = operator.card_questions[lang]

  async function add(event: FormEvent) {
    event.preventDefault()
    const message = text.trim()
    if (!message) {
      setNotice(t('paste_empty'))
      return
    }
    try {
      await addPastedMessage(message)
      setText('')
      setNotice(t('paste_added'))
    } catch {
      setNotice(t('paste_failed'))
    }
  }

  return (
    <details className="paste">
      <summary>{t('paste_open')}</summary>
      <form className="stack" onSubmit={add}>
        <div>
          <label className="field-label" htmlFor="paste-text">
            {t('paste_label')}
          </label>
          <div className="hint" id="paste-hint">
            <p>{t('paste_hint')}</p>
            <p>1) {first}</p>
            <p>2) {second}</p>
          </div>
        </div>
        <textarea
          id="paste-text"
          aria-describedby="paste-hint"
          rows={5}
          maxLength={MAX_PASTE_CHARS}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div>
          <button className="button button-secondary" type="submit">
            {t('paste_add')}
          </button>
        </div>
        <p className="notice" role="status">
          {notice}
        </p>
      </form>
    </details>
  )
}
