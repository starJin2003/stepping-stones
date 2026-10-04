import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db/db.ts'
import { queueSummary, retryUnsent, sendOutboxNow, useOutboxState } from '../db/outbox.ts'
import { useSettings } from '../db/settings.ts'
import { useLanguage } from '../i18n/language.tsx'
import { countKey, DATE_LOCALE, type Lang, type StringKey } from '../i18n/strings.ts'
import { operator } from '../operator/active.ts'
import { composeSummary, SMS_PART_MAX, summaryCounts } from '../summary/summary.ts'
import { groupSummaries, outboxMessage, type SentSummary } from '../sync/outbox.ts'

const STATUS_KEYS: Record<SentSummary['status'], StringKey> = {
  sent: 'summary_status_sent',
  failed: 'summary_status_failed',
  waiting: 'summary_status_waiting',
}

/** "Sep 27" / "27 Sep", with the year only when it is not this year. */
function dayMonth(iso: string, lang: Lang): string {
  const date = new Date(iso)
  const otherYear = date.getFullYear() !== new Date().getFullYear()
  return new Intl.DateTimeFormat(DATE_LOCALE[lang], {
    day: 'numeric',
    month: 'short',
    ...(otherYear ? { year: 'numeric' } : {}),
  }).format(date)
}

export function SummaryScreen() {
  const { lang, t } = useLanguage()
  const owner = operator.owner_name
  const records = useLiveQuery(() => db.records.toArray())
  const outbox = useLiveQuery(() => db.outbox.toArray())
  const settings = useSettings()
  const { sending, last } = useOutboxState()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [meaning, setMeaning] = useState(false)

  const title = <h1>{t('summary_title', { owner })}</h1>
  if (!records || !outbox || !settings) return title

  const counts = summaryCounts(records, operator, settings.last_summary_at ?? null, new Date())
  const parts = composeSummary(operator, counts)
  const toCheck = records.filter((r) => r.review_status === 'Pending' && !r.synthetic).length
  const summaries = groupSummaries(outbox)
  const [latest, ...earlier] = summaries
  const row = (s: SentSummary) => ({ date: dayMonth(s.created_at, lang), n: s.parts.length, status: t(STATUS_KEYS[s.status]) })
  const message = last && outboxMessage(last, lang, owner)

  async function send() {
    setBusy(true)
    setFailed(false)
    try {
      // Only this tap creates outbox items. Sending starts at once and waits for signal if there is none.
      await queueSummary(parts.map((part) => part.text))
      sendOutboxNow().catch(() => {})
    } catch {
      setFailed(true)
    }
    setBusy(false)
  }

  return (
    <>
      {title}
      <div className="period">
        <p className="lead">{t('summary_since', { date: dayMonth(counts.since, lang) })}</p>
        {counts.includesSample && <p className="hint">{t('summary_sample')}</p>}
      </div>

      <div className="stack">
        <div>
          <button className="link-button" type="button" aria-pressed={meaning} onClick={() => setMeaning(!meaning)}>
            {t(meaning ? 'summary_hide_meaning' : 'summary_show_meaning')}
          </button>
        </div>
        <ol className="phone-sms-list" aria-label={t('summary_preview_label')}>
          {parts.map((part, i) => (
            <li className="phone-sms" key={i}>
              <p className="phone-sms-bar">
                <span>{t('summary_part', { n: i + 1, total: parts.length })}</span>
                <span>
                  {t('summary_chars', { n: part.length, max: SMS_PART_MAX })}
                  {!part.fits && ` ${t('summary_too_long')}`}
                </span>
              </p>
              <p className="phone-sms-text" lang="ki">
                {part.text}
              </p>
              {meaning && (
                <p className="phone-sms-meaning">
                  <span className="tag-label">{t('summary_meaning')}</span> <span lang="en">{part.meaning}</span>
                </p>
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="stack">
        {toCheck > 0 && (
          <a className="check-first" href="#messages">
            {t(countKey(toCheck, 'summary_check_first_one', 'summary_check_first_other'), { n: toCheck })}
          </a>
        )}
        <button
          className="button button-primary button-main"
          type="button"
          onClick={send}
          disabled={busy || sending || counts.visitors === 0 || !parts.every((part) => part.fits)}
        >
          {t('summary_send')}
        </button>
        {counts.visitors === 0 && <p className="hint">{t('summary_nothing_new')}</p>}
        <p className="notice" role="status">
          {failed ? t('summary_failed') : sending ? t('outbox_sending') : message}
        </p>
      </div>

      {latest && (
        <div className="stack">
          <p>{t('summary_last', row(latest))}</p>
          {summaries.some((s) => s.status !== 'sent') && (
            <div>
              <button
                className="button button-secondary"
                type="button"
                disabled={sending}
                onClick={() => retryUnsent().catch(() => {})}
              >
                {t('outbox_retry')}
              </button>
            </div>
          )}
          {earlier.length > 0 && (
            <details className="fold">
              <summary>{t('summary_earlier', { n: earlier.length })}</summary>
              <ul className="rows">
                {earlier.map((s) => (
                  <li className="row" key={s.created_at}>
                    {t('summary_row', row(s))}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <p className="footnote">{t('summary_mt_note')}</p>
    </>
  )
}
