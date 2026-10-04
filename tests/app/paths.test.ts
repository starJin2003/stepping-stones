import { describe, expect, it } from 'vitest'
import type { ReviewStatus } from '../../src/db/types.ts'
import type { ChainRecord } from '../../src/lib/chains.ts'
import { layoutStones, PEBBLES_SHOWN, STONES_SHOWN, visiblePebbles, visibleStones } from '../../src/lib/paths.ts'
import { excerpt, firstLine } from '../../src/lib/text.ts'

const DAY = 24 * 60 * 60 * 1000
const START = Date.parse('2026-01-01T12:00:00.000Z')

function visit(id: string, day: number, prior: string | null = null, status?: ReviewStatus): ChainRecord {
  return {
    record_id: id,
    received_at: new Date(START + day * DAY).toISOString(),
    review_status: status ?? (prior ? 'Confirmed' : 'Rejected'),
    confirmed_prior_record_id: prior,
    synthetic: true,
  }
}

/** A path of `length` visits, `step` days apart, each linked to the one before. */
function path(name: string, firstDay: number, length: number, step = 3): ChainRecord[] {
  return Array.from({ length }, (_, i) => visit(`${name}-${i + 1}`, firstDay + i * step, i === 0 ? null : `${name}-${i}`))
}

describe('Stones at scale: 60 sample-like visitors', () => {
  // Day 280 is the newest visit. Paths A and B are recent; C and D have had no new stone for over 60 days.
  const records = [
    ...path('a', 250, 12, 2), // 250 to 272
    ...path('b', 260, 3, 10), // 260 to 280
    ...path('c', 100, 4), // 100 to 109
    ...path('d', 150, 2), // 150 to 153
    ...Array.from({ length: 38 }, (_, i) => visit(`solo-${i + 1}`, 5 + i * 7)),
    visit('pending', 279, null, 'Pending'),
  ]

  it('has 60 records', () => {
    expect(records).toHaveLength(60)
  })

  const layout = layoutStones(records)

  it('puts the path with the most recent new stone first', () => {
    expect(layout.active.map((chain) => chain[0].record_id)).toEqual(['b-1', 'a-1'])
  })

  it('folds paths with no new stone for 60 days under earlier paths, newest first', () => {
    expect(layout.earlier.map((chain) => chain[0].record_id)).toEqual(['d-1', 'c-1'])
  })

  it('draws the 5 most recent stones of a long path and folds the rest', () => {
    const a = layout.active[1]
    const { shown, hidden } = visibleStones(a, false)
    expect(hidden).toBe(7)
    expect(shown).toHaveLength(STONES_SHOWN)
    expect(shown.map((r) => r.record_id)).toEqual(['a-8', 'a-9', 'a-10', 'a-11', 'a-12'])
    expect(visibleStones(a, true)).toEqual({ shown: a, hidden: 0 })
    expect(visibleStones(layout.active[0], false).hidden).toBe(0)
  })

  it('draws at most 10 pebbles for visitors with no link, then a count', () => {
    expect(layout.unlinked).toHaveLength(39)
    expect(layout.unlinked[0].record_id).toBe('pending')
    const { shown, more } = visiblePebbles(layout.unlinked)
    expect(shown).toHaveLength(PEBBLES_SHOWN)
    expect(more).toBe(29)
  })

  it('every record is in exactly one place', () => {
    const placed = [...layout.active.flat(), ...layout.earlier.flat(), ...layout.unlinked].map((r) => r.record_id)
    expect(new Set(placed).size).toBe(60)
    expect(placed).toHaveLength(60)
  })

  it('an empty phone has nothing to draw', () => {
    expect(layoutStones([])).toEqual({ active: [], earlier: [], unlinked: [] })
  })
})

describe('excerpt', () => {
  it('keeps short text as written', () => {
    expect(excerpt('Come hungry. The lunch is simple.')).toBe('Come hungry. The lunch is simple.')
  })

  it('cuts at a word boundary near 60 characters, in the original language', () => {
    const german = 'Unbedingt beim Rösten mitmachen! Noor röstet die Bohnen in einer Pfanne über dem Holzfeuer.'
    const cut = excerpt(german)
    expect(cut).toBe('Unbedingt beim Rösten mitmachen! Noor röstet die Bohnen in…')
    expect(cut.length).toBeLessThanOrEqual(61)
    expect(german.startsWith(cut.slice(0, -1))).toBe(true)
  })

  it('drops trailing punctuation before the ellipsis and folds spaces', () => {
    expect(excerpt('One two three, four five six seven eight nine, ten eleven twelve thirteen')).toBe(
      'One two three, four five six seven eight nine, ten eleven…',
    )
    expect(excerpt('  a\n\nb  ')).toBe('a b')
  })

  it('cuts one very long word where it is', () => {
    expect(excerpt('x'.repeat(100))).toBe(`${'x'.repeat(60)}…`)
  })
})

describe('firstLine', () => {
  it('is the first line of a message', () => {
    expect(firstLine('1) heard\n2) would tell')).toBe('1) heard')
  })
})
