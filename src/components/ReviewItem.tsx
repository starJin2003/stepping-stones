import { useState } from 'react'
import type { MatchStrength, VisitRecord } from '../db/types.ts'
import { useLanguage } from '../i18n/language.tsx'
import type { StringKey } from '../i18n/strings.ts'
import { sameCategoryKind, sameCategoryLine } from '../lib/categories.ts'
import type { ChainRecord } from '../lib/chains.ts'
import type { Decision } from '../lib/review.ts'
import { sourceWords } from '../lib/visitors.ts'
import { operator } from '../operator/active.ts'
import { StoneGlyph } from './StoneGlyph.tsx'
import { ChainPath } from './Stones.tsx'
import { ReadingTags } from './Tags.tsx'

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
 * One message waiting for a person. What visitors wrote are bubbles, what the AI read are tags, and what a
 * person decides are buttons. Only these buttons ever set Confirmed or Rejected.
 */
export function ReviewItem({ record, view, byId, labels, chain, canUndo, busy, failed, onDecide, onUndo }: Props) {
  const { lang, t } = useLanguage()
  const [index, setIndex] = useState(0)
  const notice = failed && (
    <p className="notice" role="alert">
      {t('review_failed')}
    </p>
  )

  if (view !== 'review') {
    const prior = record.confirmed_prior_record_id
    const outcome: Record<Exclude<ReviewView, 'review'>, string> = {
      linked: prior && labels.has(prior) ? t('status_confirmed', { visitor: labels.get(prior)! }) : t('status_confirmed_unknown'),
      not_linked: t('status_rejected'),
      left: t('review_left'),
    }
    return (
      <li className="review review-done">
        <h2 className="meta-title">{labels.get(record.record_id)}</h2>
        {view === 'linked' && chain && <ChainPath chain={chain} newId={record.record_id} />}
        <p className="lead" role="status">
          {outcome[view]}
        </p>
        {canUndo && (
          <div>
            <button className="button button-secondary" type="button" onClick={onUndo} disabled={busy}>
              {t('review_undo')}
            </button>
          </div>
        )}
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
    <li className="review">
      <div className="meta">
        <h2 className="meta-title">{labels.get(record.record_id)}</h2>
        <span>{sourceWords(record, lang)}</span>
      </div>
      {/* Exactly as the visitor wrote it, in whatever language: never translated. */}
      <blockquote className="bubble bubble-in" lang="">
        {record.raw_text_local}
      </blockquote>
      <ReadingTags record={record} />

      {why && <p className="lead">{t(why)}</p>}
      {shown && (
        <div className="pair">
          <p className="pair-label">{t('review_heard_label')}</p>
          <blockquote className="bubble bubble-heard" lang="">
            {record.incoming_story_text}
          </blockquote>
          <p className="pair-strength">
            <StoneGlyph strength={strength} />
            <span>{t(`match_${strength}`)}</span>
          </p>
          <p className="pair-label pair-label-end">
            {t('review_candidate', { visitor: labels.get(shown.record_id) ?? '' })}
            {shown.synthetic && <span className="pair-sample">{t('source_seed')}</span>}
          </p>
          <blockquote className="bubble bubble-tell" lang="">
            {shown.outgoing_story_text}
          </blockquote>
          <p className={`verdict verdict-${sameCategoryKind(operator, record.visit_reason_category, shown.pass_on_category)}`}>
            {sameCategoryLine(operator, record.visit_reason_category, shown.pass_on_category, lang)}
          </p>
          {candidates.length > 1 && (
            <div>
              <button className="link-button" type="button" onClick={() => setIndex(index + 1)}>
                {t('review_see_another')}
              </button>
            </div>
          )}
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
        <button className="button button-secondary button-main" type="button" disabled={busy} onClick={() => onDecide('not_linked')}>
          {t('review_not_linked')}
        </button>
        <button className="text-button" type="button" disabled={busy} onClick={() => onDecide('leave')}>
          {t('review_leave')}
        </button>
      </div>
      {notice}
    </li>
  )
}
