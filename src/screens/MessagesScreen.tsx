import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState, type FormEvent } from 'react'
import { SampleHistoryButtons } from '../components/SampleHistoryButtons.tsx'
import { db } from '../db/db.ts'
import { addPastedMessage, MAX_PASTE_CHARS, saveNewRecords } from '../db/records.ts'
import { useSettings } from '../db/settings.ts'
import { reviewWords, sourceWords, visitorLabels } from '../lib/visitors.ts'
import { operator } from '../operator/active.ts'
import { getNewMessages, syncMessage } from '../sync/sync.ts'

export function MessagesScreen() {
  const records = useLiveQuery(() => db.records.orderBy('received_at').reverse().toArray())
  const settings = useSettings()
  const [syncing, setSyncing] = useState(false)
  const [syncNotice, setSyncNotice] = useState('')
  const labels = useMemo(() => visitorLabels(records ?? []), [records])

  async function getNew() {
    setSyncing(true)
    setSyncNotice('')
    const result = await getNewMessages({
      fetch: window.fetch.bind(window),
      store: { saveNew: saveNewRecords },
      serverUrl: settings?.server_url ?? '',
      syncToken: settings?.sync_token ?? '',
      isOnline: () => navigator.onLine,
    })
    setSyncNotice(syncMessage(result))
    setSyncing(false)
  }

  return (
    <>
      <h1>Messages</h1>

      <div className="stack">
        <div>
          <button className="button button-primary" type="button" onClick={getNew} disabled={syncing || !settings}>
            {syncing ? 'Getting new messages' : 'Get new messages'}
          </button>
        </div>
        <p className="notice" role="status">
          {syncNotice}
        </p>
        <PasteBox />
      </div>

      {records && records.length === 0 && (
        <div className="stack">
          <p className="lead">No messages on this phone yet.</p>
          <p>Get new messages, paste a text message, or load sample history to see how the app works.</p>
          <SampleHistoryButtons showRemove={false} />
        </div>
      )}

      {records && records.length > 0 && (
        <ol className="messages" aria-label="Messages, newest first">
          {records.map((r) => (
            <li className="message" key={r.record_id}>
              <h2>{labels.get(r.record_id)}</h2>
              <blockquote className="sms">{r.raw_text_local}</blockquote>
              <div className="message-meta">
                <p>{sourceWords(r)}</p>
                <p className={`status status-${r.review_status.toLowerCase()}`}>{reviewWords(r, labels)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

function PasteBox() {
  const [text, setText] = useState('')
  const [notice, setNotice] = useState('')
  const [first, second] = operator.card_questions.en

  async function add(event: FormEvent) {
    event.preventDefault()
    const message = text.trim()
    if (!message) {
      setNotice('Paste or type a text message first.')
      return
    }
    try {
      await addPastedMessage(message)
      setText('')
      setNotice('Message added.')
    } catch {
      setNotice('Could not save the message on this phone. Try again.')
    }
  }

  return (
    <details className="paste">
      <summary>Paste an SMS</summary>
      <form className="stack" onSubmit={add}>
        <div>
          <label className="field-label" htmlFor="paste-text">
            Text message
          </label>
          <div className="hint" id="paste-hint">
            <p>Visitors answer the two questions on the card:</p>
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
          <button className="button button-primary" type="submit">
            Add message
          </button>
        </div>
        <p className="notice" role="status">
          {notice}
        </p>
      </form>
    </details>
  )
}
