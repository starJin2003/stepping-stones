import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState, type FormEvent } from 'react'
import { useAnalysing } from '../ai/analysing.ts'
import { ModelCard } from '../components/ModelCard.tsx'
import { ReviewItem, type ReviewView } from '../components/ReviewItem.tsx'
import { SampleHistoryButtons } from '../components/SampleHistoryButtons.tsx'
import { db } from '../db/db.ts'
import { addPastedMessage, decideOnPhone, MAX_PASTE_CHARS, saveNewRecords, undoOnPhone } from '../db/records.ts'
import { useSettings } from '../db/settings.ts'
import type { VisitRecord } from '../db/types.ts'
import { useLanguage } from '../i18n/language.tsx'
import { countKey } from '../i18n/strings.ts'
import { buildChains } from '../lib/chains.ts'
import type { Decision, LastDecision } from '../lib/review.ts'
import { firstLine } from '../lib/text.ts'
import { visitorLabels } from '../lib/visitors.ts'
import { operator } from '../operator/active.ts'
import { getNewMessages, syncMessage } from '../sync/sync.ts'

/**
 * A record stays in the review list while it is Pending, and also after a decision made on this screen,
 * shown as its outcome, so items never jump away under a person's finger.
 */
function reviewView(r: VisitRecord, decided: Decision | undefined): ReviewView | null {
  if (decided === 'same_story' && r.review_status === 'Confirmed') return 'linked'
  if (decided === 'not_linked' && r.review_status === 'Rejected') return 'not_linked'
  if (decided === 'leave' && r.review_status === 'Pending') return 'left'
  return r.review_status === 'Pending' ? 'review' : null
}

export function MessagesScreen() {
  const { lang, t } = useLanguage()
  const records = useLiveQuery(() => db.records.orderBy('received_at').reverse().toArray())
  const settings = useSettings()
  const [syncing, setSyncing] = useState(false)
  const [syncNotice, setSyncNotice] = useState('')
  const labels = useMemo(() => visitorLabels(records ?? [], lang), [records, lang])
  const byId = useMemo(() => new Map((records ?? []).map((r) => [r.record_id, r])), [records])
  const chains = useMemo(() => buildChains(records ?? []), [records])
  const analysing = useAnalysing()

  // Decisions made on this screen, and the last one, which Undo reverses.
  const [decided, setDecided] = useState<ReadonlyMap<string, Decision>>(new Map())
  const [last, setLast] = useState<LastDecision | null>(null)
  const [busy, setBusy] = useState(false)
  const [failedId, setFailedId] = useState<string | null>(null)

  // The to-do: real messages a person has not checked yet. Sample history never counts.
  const toCheck = records?.filter((r) => r.review_status === 'Pending' && !r.synthetic).length
  const toReview = (records ?? []).filter((r) => reviewView(r, decided.get(r.record_id)) !== null)
  const checked = (records ?? []).filter((r) => reviewView(r, decided.get(r.record_id)) === null)

  async function run(id: string, action: () => Promise<void>) {
    setBusy(true)
    setFailedId(null)
    try {
      await action()
    } catch {
      setFailedId(id)
    }
    setBusy(false)
  }

  const decide = (id: string, decision: Decision, candidateId?: string) =>
    run(id, async () => {
      const result = await decideOnPhone(id, decision, candidateId)
      if (!result) return
      setDecided((prev) => new Map(prev).set(id, decision))
      setLast(result)
    })

  const undo = () =>
    last &&
    run(last.record_id, async () => {
      if (await undoOnPhone(last)) {
        setDecided((prev) => {
          const next = new Map(prev)
          next.delete(last.record_id)
          return next
        })
      }
      setLast(null)
    })

  async function sync() {
    setSyncing(true)
    setSyncNotice('')
    const result = await getNewMessages({
      fetch: window.fetch.bind(window),
      store: { saveNew: saveNewRecords },
      serverUrl: '',
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
        {/* The main action follows the to-do: checking messages when there are some, otherwise syncing. */}
        <button
          className={toCheck ? 'button button-secondary' : 'button button-primary button-main'}
          type="button"
          onClick={sync}
          disabled={syncing}
        >
          {syncing ? t('syncing') : t('sync')}
        </button>
        <p className="notice" role="status">
          {syncNotice}
        </p>
      </div>

      <ModelCard />
      {analysing > 0 && (
        <p className="hint" role="status">
          {t(countKey(analysing, 'analysing_one', 'analysing_other'), { n: analysing })}
        </p>
      )}

      {toReview.length > 0 && (
        <ol className="reviews" aria-label={t('review_list_label')}>
          {toReview.map((r) => (
            <ReviewItem
              key={r.record_id}
              record={r}
              view={reviewView(r, decided.get(r.record_id))!}
              byId={byId}
              labels={labels}
              chain={chains.find((chain) => chain.some((c) => c.record_id === r.record_id))}
              canUndo={last?.record_id === r.record_id}
              busy={busy}
              failed={failedId === r.record_id}
              onDecide={(decision, candidateId) => decide(r.record_id, decision, candidateId)}
              onUndo={undo}
            />
          ))}
        </ol>
      )}

      {records && records.length === 0 && (
        <div className="stack">
          <p className="lead">{t('empty_title')}</p>
          <p>{t('empty_body')}</p>
          <SampleHistoryButtons showRemove={false} />
        </div>
      )}
      <PasteBox />

      {checked.length > 0 && (
        <details className="fold">
          <summary>{t('checked_title', { n: checked.length })}</summary>
          {checked.some((r) => r.synthetic) && <p className="hint">{t('sample_note')}</p>}
          <ul className="rows">
            {checked.map((r) => (
              <li className="row" key={r.record_id}>
                <span className="row-label">{labels.get(r.record_id)}</span>
                <span className={r.review_status === 'Confirmed' ? 'status-tag status-linked' : 'status-tag'}>
                  {t(r.review_status === 'Confirmed' ? 'tag_linked' : 'tag_not_linked')}
                </span>
                {/* The visitor's own words, cut to one line, never translated. */}
                <span className="row-text" lang="">
                  {firstLine(r.raw_text_local)}
                </span>
              </li>
            ))}
          </ul>
        </details>
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
