import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db/db.ts'
import { queueSummary, retryUnsent, sendOutboxNow, useOutboxState } from '../db/outbox.ts'
import { useSettings } from '../db/settings.ts'
import { useLanguage } from '../i18n/language.tsx'
import { countKey, DATE_LOCALE } from '../i18n/strings.ts'
import { operator } from '../operator/active.ts'
import { composeSummary, SMS_PART_MAX, summaryCounts } from '../summary/summary.ts'
import { outboxMessage } from '../sync/outbox.ts'

export function SummaryScreen() {
  const { lang, t } = useLanguage()
  const owner = operator.owner_name
  const records = useLiveQuery(() => db.records.toArray())
  const outbox = useLiveQuery(() => db.outbox.toArray())
  const settings = useSettings()
  const { sending, last } = useOutboxState()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const title = <h1>{t('summary_title', { owner })}</h1>
  if (!records || !outbox || !settings) return title

  const counts = summaryCounts(records, operator, settings.last_summary_at ?? null, new Date())
  const parts = composeSummary(operator, counts)
  const nothingNew = counts.visitors === 0 && counts.needsReview === 0
  const date = (iso: string, time = false) =>
    new Intl.DateTimeFormat(DATE_LOCALE[lang], {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(time ? { hour: 'numeric', minute: '2-digit' } : {}),
    }).format(new Date(iso))
  // Newest summary first, its parts in order.
  const items = [...outbox].sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
  const unsent = outbox.some((item) => item.status !== 'Sent')
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
      <div className="stack">
        <p className="lead">
          {counts.first ? t('summary_period_first') : t('summary_period_since', { date: date(counts.since) })}
        </p>
        {counts.includesSample && <p>{t('includes_sample')}</p>}
        {counts.notRead > 0 && (
          <p>{t(countKey(counts.notRead, 'summary_not_read_one', 'summary_not_read_other'), { n: counts.notRead })}</p>
        )}
        <p className="hint">{t('summary_mt_note')}</p>
      </div>

      <ol className="sms-parts" aria-label={t('summary_preview_label')}>
        {parts.map((part, i) => (
          <li className="sms-part" key={i}>
            <h2>{t('summary_part', { n: i + 1, total: parts.length })}</h2>
            <blockquote className="sms sms-owner" lang="ki">
              {part.text}
            </blockquote>
            <p className={part.fits ? 'hint' : 'notice'}>
              {t('summary_chars', { n: part.length, max: SMS_PART_MAX })}
              {!part.fits && ` ${t('summary_too_long')}`}
            </p>
            <p className="meaning">
              {t('summary_meaning')} <span lang="en">{part.meaning}</span>
            </p>
          </li>
        ))}
      </ol>

      <div className="stack">
        <button
          className="button button-primary button-main"
          type="button"
          onClick={send}
          disabled={busy || nothingNew || !parts.every((part) => part.fits)}
        >
          {t('summary_send', { owner })}
        </button>
        {nothingNew && <p className="hint">{t('summary_nothing_new')}</p>}
        <p className="notice" role="status">
          {failed ? t('summary_failed') : sending ? t('outbox_sending') : message}
        </p>
      </div>

      {items.length > 0 && (
        <section className="section" aria-labelledby="outbox-title">
          <h2 id="outbox-title">{t('outbox_title')}</h2>
          <ol className="outbox">
            {items.map((item) => (
              <li className={`outbox-item outbox-${item.status.toLowerCase()}`} key={item.id}>
                <p lang="ki">{item.text}</p>
                <p className="hint">
                  {t('outbox_meta', { status: t(`outbox_${item.status}`), date: date(item.created_at, true) })}
                </p>
              </li>
            ))}
          </ol>
          {unsent && (
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
        </section>
      )}
    </>
  )
}
