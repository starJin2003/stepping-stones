import { useEffect, useRef } from 'react'
import type { VisitRecord } from '../db/types.ts'
import { useLanguage } from '../i18n/language.tsx'
import type { ChainRecord } from '../lib/chains.ts'
import { stonePath, stoneShape } from '../lib/stones.ts'

// Chains of confirmed links, drawn as irregular stones across a thin stream line. Stones are Leaf; the most
// recently confirmed one is Stone red, as in the app icon. The drawings repeat what the text beside them
// says, so they are hidden from screen readers.

const stoneClass = (red: boolean) => (red ? 'stone stone-red' : 'stone')

const MINI_WIDTH = 320
const MINI_HEIGHT = 72
const MINI_STEP = 64
const MINI_MAX = 5

/**
 * The small path shown in place of a review item right after "Same story". Only the new stone moves: it
 * settles into the path. With reduced motion it is drawn already in place (see index.css).
 */
export function ChainPath({ chain, newId }: { chain: ChainRecord[]; newId: string }) {
  const at = Math.max(0, chain.findIndex((r) => r.record_id === newId))
  const start = Math.max(0, Math.min(at - (MINI_MAX - 1), chain.length - MINI_MAX))
  const shown = chain.slice(start, start + MINI_MAX)
  const first = MINI_WIDTH / 2 - ((shown.length - 1) * MINI_STEP) / 2
  const mid = MINI_HEIGHT / 2

  return (
    <svg className="chain-path" viewBox={`0 0 ${MINI_WIDTH} ${MINI_HEIGHT}`} aria-hidden="true" focusable="false">
      <path className="stream" d={`M0 ${mid} C 53 ${mid - 9}, 107 ${mid + 9}, 160 ${mid} S 267 ${mid + 9}, 320 ${mid}`} />
      {shown.map((r, i) => {
        const isNew = r.record_id === newId
        const path = stonePath(r.record_id, first + i * MINI_STEP, mid + stoneShape(r.record_id).shift * 4, 50)
        return isNew ? (
          <g key={r.record_id} className="stone-settle">
            <path className={stoneClass(true)} d={path} />
          </g>
        ) : (
          <path key={r.record_id} className={stoneClass(false)} d={path} />
        )
      })}
    </svg>
  )
}

const ROW_WIDTH = 96
const ROW_HEIGHT = 88
const STREAM_X = 48
const STREAM_SWING = 9

const swingOf = (row: number) => (row % 2 === 0 ? STREAM_SWING : -STREAM_SWING)

/** One row of the stream: an S-curve that leaves and arrives vertically, so rows join without a kink. */
function streamSegment(row: number): string {
  const x = STREAM_X
  const swing = swingOf(row)
  const half = ROW_HEIGHT / 2
  return `M${x} 0 C${x} ${half * 0.6} ${x + swing} ${half * 0.4} ${x + swing} ${half} C${x + swing} ${half * 1.6} ${x} ${half * 1.4} ${x} ${ROW_HEIGHT}`
}

/** The stream for one row; it stretches with the row, so it never breaks. */
export function StreamLine({ row }: { row: number }) {
  return (
    <svg
      className="stream-line"
      viewBox={`0 0 ${ROW_WIDTH} ${ROW_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path className="stream" d={streamSegment(row)} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** One stepping stone across the stream; it sits a little off the line, by record. */
export function StreamStone({ id, row, red }: { id: string; row: number; red: boolean }) {
  const cx = STREAM_X + swingOf(row) * 0.6 + stoneShape(id).shift * 5
  return (
    <span className="stream-art" aria-hidden="true">
      <StreamLine row={row} />
      <svg className="stream-stone" viewBox={`0 0 ${ROW_WIDTH} ${ROW_HEIGHT}`} focusable="false">
        <path className={stoneClass(red)} d={stonePath(id, cx, ROW_HEIGHT / 2, 64)} />
      </svg>
    </span>
  )
}

/** Small outline pebbles for visitors with no confirmed link yet. Shapes come from the record ids. */
export function Pebbles({ ids }: { ids: string[] }) {
  return (
    <span className="pebble-row" aria-hidden="true">
      {ids.map((id) => (
        <svg key={id} className="pebble" viewBox="0 0 36 28" focusable="false">
          <path className="stone-outline" d={stonePath(id, 18, 14, 28)} />
        </svg>
      ))}
    </span>
  )
}

/**
 * A simple sheet for one stone: the visitor's own SMS and, if linked, what the earlier visitor would tell
 * friends. Opens and closes without motion; the backdrop, Escape and the button close it.
 */
export function StoneSheet({
  record,
  prior,
  labels,
  onClose,
}: {
  record: VisitRecord
  prior: VisitRecord | undefined
  labels: Map<string, string>
  onClose: () => void
}) {
  const { t } = useLanguage()
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="sheet-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close()
      }}
    >
      <div className="sheet-body">
        <div className="meta">
          <h2 className="meta-title" id="sheet-title">
            {labels.get(record.record_id)}
          </h2>
          {record.synthetic && <span>{t('source_seed')}</span>}
        </div>
        <blockquote className="bubble bubble-in" lang="">
          {record.raw_text_local}
        </blockquote>
        {prior && (
          <>
            <p className="pair-label pair-label-end">
              {t('sheet_heard_from', { visitor: labels.get(prior.record_id) ?? '' })}
            </p>
            <blockquote className="bubble bubble-tell" lang="">
              {prior.outgoing_story_text}
            </blockquote>
          </>
        )}
        <button className="button button-secondary button-main" type="button" onClick={() => ref.current?.close()}>
          {t('sheet_close')}
        </button>
      </div>
    </dialog>
  )
}
