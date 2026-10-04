import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Pebbles, StoneSheet, StreamLine, StreamStone } from '../components/Stones.tsx'
import { HeardFromTag, isUnclearReferral } from '../components/Tags.tsx'
import { db } from '../db/db.ts'
import type { VisitRecord } from '../db/types.ts'
import { useLanguage } from '../i18n/language.tsx'
import { countKey } from '../i18n/strings.ts'
import { isKnownReason, reasonLabel, referralLabel } from '../lib/categories.ts'
import { latestConfirmed } from '../lib/chains.ts'
import { layoutStones, visiblePebbles, visibleStones } from '../lib/paths.ts'
import { monthLabel, visitorLabels } from '../lib/visitors.ts'
import { operator } from '../operator/active.ts'
import { countRecords } from '../summary/summary.ts'

/** The earlier visitor this record's confirmed link points at, if it is on the phone. */
const priorOf = (r: VisitRecord, byId: Map<string, VisitRecord>) =>
  r.review_status === 'Confirmed' && r.confirmed_prior_record_id ? byId.get(r.confirmed_prior_record_id) : undefined

export function StonesScreen() {
  const { lang, t } = useLanguage()
  const records = useLiveQuery(() => db.records.orderBy('received_at').toArray())
  const labels = useMemo(() => visitorLabels(records ?? [], lang), [records, lang])
  const byId = useMemo(() => new Map((records ?? []).map((r) => [r.record_id, r])), [records])
  const layout = useMemo(() => layoutStones(records ?? []), [records])
  const [open, setOpen] = useState<VisitRecord | null>(null)

  const title = <h1>{t('stones_title')}</h1>
  if (!records) return title
  if (records.length === 0) {
    return (
      <>
        {title}
        <p>{t('stones_none')}</p>
      </>
    )
  }

  const counts = countRecords(records, operator)
  const red = latestConfirmed(records)
  const pebbles = visiblePebbles(layout.unlinked)
  const pathProps = { byId, labels, red, onOpen: setOpen }

  return (
    <>
      {title}

      <div className="tiles">
        <p className="tile">
          <span className="tile-number">{counts.visitors}</span>
          <span>
            {t(countKey(counts.visitors, 'stones_since_one', 'stones_since_other'), {
              month: monthLabel(records[0].received_at, lang),
            })}
          </span>
        </p>
        <p className="tile tile-stones">
          <span className="tile-number">{counts.referred}</span>
          <span>{t(countKey(counts.referred, 'stones_through_one', 'stones_through_other'))}</span>
        </p>
      </div>
      <dl className="facts">
        <div>
          <dt>{t('stones_heard_most')}</dt>
          <dd className={isUnclearReferral(counts.topReferral) ? 'unclear' : undefined}>
            {referralLabel(counts.topReferral, lang)}
          </dd>
        </div>
        <div>
          <dt>{t('stones_passed_most')}</dt>
          <dd className={isKnownReason(operator, counts.topPassOn) ? undefined : 'unclear'}>
            {reasonLabel(operator, counts.topPassOn, lang)}
          </dd>
        </div>
      </dl>

      {counts.includesSample && <p className="hint">{t('sample_note')}</p>}
      {layout.active.length + layout.earlier.length === 0 && <p>{t('stones_none')}</p>}
      {layout.active.map((chain, i) => (
        <Path key={chain[0].record_id} chain={chain} n={i + 1} {...pathProps} />
      ))}
      {layout.earlier.length > 0 && (
        <details className="fold">
          <summary>{t('path_earlier_paths', { n: layout.earlier.length })}</summary>
          {layout.earlier.map((chain, i) => (
            <Path key={chain[0].record_id} chain={chain} n={layout.active.length + i + 1} {...pathProps} />
          ))}
        </details>
      )}

      {layout.unlinked.length > 0 && (
        <p className="pebbles">
          <span>{t('not_linked_yet', { n: layout.unlinked.length })}</span>
          <Pebbles ids={pebbles.shown.map((r) => r.record_id)} />
          {pebbles.more > 0 && <span className="pebble-more">{t('pebbles_more', { n: pebbles.more })}</span>}
        </p>
      )}

      {open && <StoneSheet record={open} prior={priorOf(open, byId)} labels={labels} onClose={() => setOpen(null)} />}
    </>
  )
}

interface PathProps {
  chain: VisitRecord[]
  n: number
  byId: Map<string, VisitRecord>
  labels: Map<string, string>
  red: string | null
  onOpen: (record: VisitRecord) => void
}

/**
 * One path: its most recent stones across the stream, and between two linked stones the tour part the earlier
 * visitor passed on, in the UI language. The visitors' own words are in the sheet a stone opens.
 */
function Path({ chain, n, byId, labels, red, onOpen }: PathProps) {
  const { lang, t } = useLanguage()
  const [showAll, setShowAll] = useState(false)
  const { shown, hidden } = visibleStones(chain, showAll)
  const headingId = `path-${chain[0].record_id}`
  let row = 0

  return (
    <section className="path" aria-labelledby={headingId}>
      <h2 id={headingId}>{t('path_title', { n, month: monthLabel(chain[0].received_at, lang), count: chain.length })}</h2>
      {hidden > 0 && (
        <div>
          <button className="link-button" type="button" onClick={() => setShowAll(true)}>
            {t(countKey(hidden, 'path_earlier_stones_one', 'path_earlier_stones_other'), { n: hidden })}
          </button>
        </div>
      )}
      <ol className="path-steps">
        {shown.map((r, i) => {
          const prior = priorOf(r, byId)
          const above = i > 0 ? shown[i - 1] : chain[hidden - 1]
          return (
            <li key={r.record_id}>
              {prior && (
                <div className="path-travel">
                  <span className="stream-art" aria-hidden="true">
                    <StreamLine row={row++} />
                  </span>
                  <p className="travel-text">
                    {prior.record_id !== above?.record_id && (
                      <span className="travel-from">{t('path_from', { visitor: labels.get(prior.record_id) ?? '' })}</span>
                    )}
                    <span className={isKnownReason(operator, prior.pass_on_category) ? undefined : 'unclear'}>
                      {t('passed_on', { topic: reasonLabel(operator, prior.pass_on_category, lang) })}
                    </span>
                  </p>
                </div>
              )}
              <button className="path-stone" type="button" onClick={() => onOpen(r)}>
                <StreamStone id={r.record_id} row={row++} red={r.record_id === red} />
                <span className="stone-label">
                  <span className="stone-name">{labels.get(r.record_id)}</span>
                  <HeardFromTag record={r} hideUnclear />
                  {r.record_id === red && <span className="stone-latest">{t('stones_latest')}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
