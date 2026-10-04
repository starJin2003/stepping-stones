import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { StreamStone } from '../components/Stones.tsx'
import { db } from '../db/db.ts'
import { useLanguage } from '../i18n/language.tsx'
import { countKey } from '../i18n/strings.ts'
import { reasonLabel, referralLabel } from '../lib/categories.ts'
import { buildChains, latestConfirmed } from '../lib/chains.ts'
import { visitorLabels } from '../lib/visitors.ts'
import { operator } from '../operator/active.ts'
import { countRecords } from '../summary/summary.ts'

export function StonesScreen() {
  const { lang, t } = useLanguage()
  const records = useLiveQuery(() => db.records.toArray())
  const labels = useMemo(() => visitorLabels(records ?? [], lang), [records, lang])
  const chains = useMemo(() => buildChains(records ?? []), [records])

  if (!records) return <h1>{t('stones_title')}</h1>
  const counts = countRecords(records, operator)
  const red = latestConfirmed(records)

  return (
    <>
      <h1>{t('stones_title')}</h1>

      {records.length > 0 && (
        <div className="facts">
          <p>{t(countKey(counts.visitors, 'stones_visitors_one', 'stones_visitors_other'), { n: counts.visitors })}</p>
          <p>{t(countKey(counts.referred, 'stones_referred_one', 'stones_referred_other'), { n: counts.referred })}</p>
          <p>
            {t('stones_top_referral', {
              source: counts.topReferral ? referralLabel(counts.topReferral, lang) : t('not_clear_yet'),
            })}
          </p>
          <p>
            {t('stones_top_pass_on', {
              topic: counts.topPassOn ? reasonLabel(operator, counts.topPassOn, lang) : t('not_clear_yet'),
            })}
          </p>
          {counts.includesSample && <p className="hint">{t('includes_sample')}</p>}
        </div>
      )}

      {chains.length === 0 && <p>{t('stones_none')}</p>}
      {chains.map((chain) => (
        <section className="chain" key={chain[0].record_id} aria-labelledby={`chain-${chain[0].record_id}`}>
          <h2 id={`chain-${chain[0].record_id}`}>{t('stones_chain', { n: chain.length })}</h2>
          <ol className="chain-steps">
            {chain.map((r, row) => (
              <li className="chain-step" key={r.record_id}>
                <StreamStone id={r.record_id} row={row} red={r.record_id === red} />
                <span className="chain-label">
                  <span>{labels.get(r.record_id)}</span>
                  {r.synthetic && <span className="hint">{t('source_seed')}</span>}
                  {r.record_id === red && <span className="hint">{t('stones_latest')}</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </>
  )
}
