import { useState } from 'react'
import type { MatchStrength, VisitRecord } from '../db/types.ts'
import { useLanguage } from '../i18n/language.tsx'
import type { StringKey } from '../i18n/strings.ts'
import { sameCategoryLine } from '../lib/categories.ts'
import type { ChainRecord } from '../lib/chains.ts'
import type { Decision } from '../lib/review.ts'
import { sourceWords } from '../lib/visitors.ts'
import { operator } from '../operator/active.ts'
import { AiReading } from './AiReading.tsx'
import { StoneGlyph } from './StoneGlyph.tsx'
import { ChainPath } from './Stones.tsx'

/** How a review item shows: waiting for a person, or the outcome of a decision made on this screen. */
export type ReviewView = 'review' | 'linked' | 'not_linked' | 'left'

interface Props {
  record: VisitRecord
  view: ReviewView
  byId: Map<string, VisitRecord>
  labels: Map<string, string>
  /** The chain this record is in, once linked. */
  chain: ChainRecord[] | undefined
  /** Only the last decision can be undone. */
  canUndo: boolean
  busy: boolean
  failed: boolean
  onDecide: (decision: Decision, candidateId?: string) => void
  onUndo: () => void
}

/**
 * One message waiting for a person: the visitor's own words, the AI reading, and an earlier visitor's
 * "would tell" story to compare it with. Only these buttons ever set Confirmed or Rejected.
 */
export function ReviewItem({ record, view, byId, labels, chain, canUndo, busy, failed, onDecide, onUndo }: Props) {
  const { lang, t } = useLanguage()
  const [index, setIndex] = useState(0)
  const title = <h2>{labels.get(record.record_id)}</h2>
  const notice = failed && (
    <p className="notice" role="alert">
      {t('review_failed')}
    </p>
  )
  const undo = canUndo && (
    <div>
      <button className="button button-secondary" type="button" onClick={onUndo} disabled={busy}>
        {t('review_undo')}
      </button>
    </div>
  )

  if (view !== 'review') {
    const prior = record.confirmed_prior_record_id
    const outcome: Record<Exclude<ReviewView, 'review'>, string> = {
      linked: prior && labels.has(prior) ? t('status_confirmed', { visitor: labels.get(prior)! }) : t('status_confirmed_unknown'),
      not_linked: t('status_rejected'),
      left: t('review_left'),
    }
    return (
      <li className="message review-done">
        {title}
        {view === 'linked' && chain && <ChainPath chain={chain} newId={record.record_id} />}
        <p className="lead" role="status">
          {outcome[view]}
        </p>
        {undo}
        {notice}
      </li>
    )
  }

  const candidates = (record.candidate_prior_record_ids ?? []).filter((id) => byId.has(id))
  const why: StringKey | null = !record.analysis_version
    ? 'review_not_read'
    : !record.format_ok
      ? 'review_no_format'
      : candidates.length === 0
        ? 'review_no_candidate'
        : null
  const position = candidates.length ? index % candidates.length : 0
  const shown = why ? undefined : byId.get(candidates[position])
  // The record's strength describes its top candidate. The others ranked lower, so they read as Unclear.
  const strength: MatchStrength = position === 0 ? (record.match_strength ?? 'Unclear') : 'Unclear'

  return (
    <li className="message review">
      {title}
      {/* Exactly as the visitor wrote it, in whatever language: never translated. */}
      <blockquote className="sms" lang="">
        {record.raw_text_local}
      </blockquote>
      <AiReading record={record} formatNote={false} />
      <p className="hint">{sourceWords(record, lang)}</p>

      {why && <p className="lead">{t(why)}</p>}
      {shown && (
        <div className="compare">
          <p className="match">
            <StoneGlyph strength={strength} />
            <span>{t(`match_${strength}`)}</span>
          </p>
          <p>{t('review_candidate', { visitor: labels.get(shown.record_id) ?? '' })}</p>
          <blockquote className="sms sms-earlier" lang="">
            {shown.outgoing_story_text}
          </blockquote>
          {shown.synthetic && <p className="hint">{t('source_seed')}</p>}
          {candidates.length > 1 && (
            <div>
              <button className="link-button" type="button" onClick={() => setIndex(index + 1)}>
                {t('review_see_another')}
              </button>
            </div>
          )}
          <p className="lead">
            {sameCategoryLine(operator, record.visit_reason_category, shown.pass_on_category, lang)}
          </p>
        </div>
      )}

      <div className="review-actions">
        {shown && (
          <button
            className="button button-primary button-main"
            type="button"
            disabled={busy}
            onClick={() => onDecide('same_story', shown.record_id)}
          >
            {t('review_same')}
          </button>
        )}
        <div className="button-row">
          <button className="button button-secondary" type="button" disabled={busy} onClick={() => onDecide('not_linked')}>
            {t('review_not_linked')}
          </button>
          <button className="button button-secondary" type="button" disabled={busy} onClick={() => onDecide('leave')}>
            {t('review_leave')}
          </button>
        </div>
      </div>
      {notice}
    </li>
  )
}
