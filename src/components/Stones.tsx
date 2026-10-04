import type { ChainRecord } from '../lib/chains.ts'
import { stonePath, stoneShape } from '../lib/stones.ts'

// Chains of confirmed links, drawn as irregular stones across a thin stream line. Stones are Leaf; the most
// recently confirmed one is Stone red, as in the app icon. The drawings are decoration for text that says
// the same thing, so they are hidden from screen readers.

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
    <svg
      className="chain-path"
      viewBox={`0 0 ${MINI_WIDTH} ${MINI_HEIGHT}`}
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="stream"
        d={`M0 ${mid} C 53 ${mid - 9}, 107 ${mid + 9}, 160 ${mid} S 267 ${mid + 9}, 320 ${mid}`}
      />
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

/** One row of the stream: an S-curve that leaves and arrives vertically, so rows join without a kink. */
function streamSegment(row: number): string {
  const x = STREAM_X
  const swing = row % 2 === 0 ? STREAM_SWING : -STREAM_SWING
  const half = ROW_HEIGHT / 2
  return `M${x} 0 C${x} ${half * 0.6} ${x + swing} ${half * 0.4} ${x + swing} ${half} C${x + swing} ${half * 1.6} ${x} ${half * 1.4} ${x} ${ROW_HEIGHT}`
}

/** One stepping stone across the stream for a row; the stone sits a little off the line, per record. */
export function StreamStone({ id, row, red }: { id: string; row: number; red: boolean }) {
  const swing = row % 2 === 0 ? STREAM_SWING : -STREAM_SWING
  const cx = STREAM_X + swing * 0.6 + stoneShape(id).shift * 5
  return (
    <span className="stream-art" aria-hidden="true">
      <svg className="stream-line" viewBox={`0 0 ${ROW_WIDTH} ${ROW_HEIGHT}`} preserveAspectRatio="none" focusable="false">
        <path className="stream" d={streamSegment(row)} vectorEffect="non-scaling-stroke" />
      </svg>
      <svg className="stream-stone" viewBox={`0 0 ${ROW_WIDTH} ${ROW_HEIGHT}`} focusable="false">
        <path className={stoneClass(red)} d={stonePath(id, cx, ROW_HEIGHT / 2, 64)} />
      </svg>
    </span>
  )
}
