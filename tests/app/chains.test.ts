import { describe, expect, it, vi } from 'vitest'
import seedFile from '../../data/seed/noor-coffee.synthetic.json'
import { parseSampleHistory } from '../../src/db/seed.ts'
import type { ReviewStatus } from '../../src/db/types.ts'
import { buildChains, latestConfirmed, type ChainRecord } from '../../src/lib/chains.ts'
import { stonePath, stoneShape } from '../../src/lib/stones.ts'

const visit = (id: string, day: number, status: ReviewStatus = 'Rejected', prior: string | null = null): ChainRecord => ({
  record_id: id,
  received_at: `2026-09-${String(day).padStart(2, '0')}T12:00:00.000Z`,
  review_status: status,
  confirmed_prior_record_id: prior,
  synthetic: false,
})

const ids = (chains: ChainRecord[][]) => chains.map((chain) => chain.map((r) => r.record_id))

describe('buildChains', () => {
  it('follows confirmed links into one chain, oldest first', () => {
    const records = [visit('c', 9, 'Confirmed', 'b'), visit('a', 1), visit('b', 5, 'Confirmed', 'a')]
    expect(ids(buildChains(records))).toEqual([['a', 'b', 'c']])
  })

  it('a branch is one connected component, ordered by received_at', () => {
    // b and c both heard from a.
    const records = [visit('a', 1), visit('b', 3, 'Confirmed', 'a'), visit('c', 2, 'Confirmed', 'a')]
    expect(ids(buildChains(records))).toEqual([['a', 'c', 'b']])
  })

  it('leaves out visitors with no confirmed link', () => {
    const records = [visit('a', 1), visit('b', 2, 'Confirmed', 'a'), visit('lonely', 3), visit('pending', 4, 'Pending')]
    expect(ids(buildChains(records))).toEqual([['a', 'b']])
  })

  it('ignores links that are not Confirmed, or point at a visit no longer on the phone', () => {
    const records = [
      visit('a', 1),
      visit('b', 2, 'Pending', 'a'),
      visit('c', 3, 'Rejected', 'a'),
      visit('d', 4, 'Confirmed', 'removed-sample'),
      visit('e', 5, 'Confirmed', 'e'),
    ]
    expect(buildChains(records)).toEqual([])
  })

  it('puts the chain with the newest visit first', () => {
    const records = [
      visit('old-1', 1),
      visit('old-2', 2, 'Confirmed', 'old-1'),
      visit('new-1', 3),
      visit('new-2', 20, 'Confirmed', 'new-1'),
      visit('old-3', 10, 'Confirmed', 'old-2'),
    ]
    expect(ids(buildChains(records))).toEqual([
      ['new-1', 'new-2'],
      ['old-1', 'old-2', 'old-3'],
    ])
  })

  it('finds the sample history chain of four visits', () => {
    const { records } = parseSampleHistory(seedFile)
    expect(ids(buildChains(records))).toEqual([
      ['seed-noor-coffee-01', 'seed-noor-coffee-04', 'seed-noor-coffee-07', 'seed-noor-coffee-09'],
    ])
    expect(latestConfirmed(records)).toBe('seed-noor-coffee-09')
  })
})

describe('latestConfirmed', () => {
  it('is the confirmed visit with the newest received_at, or null without links', () => {
    expect(latestConfirmed([visit('a', 1), visit('b', 9, 'Confirmed', 'a'), visit('c', 5, 'Confirmed', 'a')])).toBe('b')
    expect(latestConfirmed([visit('a', 1), visit('b', 2, 'Pending', 'a')])).toBeNull()
  })
})

describe('stone shapes', () => {
  it('are the same for the same record id, every time, without randomness', () => {
    const random = vi.spyOn(Math, 'random')
    expect(stonePath('seed-noor-coffee-04', 48, 44, 64)).toBe(stonePath('seed-noor-coffee-04', 48, 44, 64))
    expect(stoneShape('SM123')).toEqual(stoneShape('SM123'))
    expect(random).not.toHaveBeenCalled()
    random.mockRestore()
  })

  it('differ between records', () => {
    expect(stonePath('a', 48, 44, 64)).not.toBe(stonePath('b', 48, 44, 64))
  })

  it('stay a closed path within their row', () => {
    const path = stonePath('paste-1', 48, 44, 64)
    expect(path).toMatch(/^M[\d. L-]+Z$/)
    const numbers = path.slice(1, -1).split(/[ L]/).map(Number)
    const xs = numbers.filter((_, i) => i % 2 === 0)
    const ys = numbers.filter((_, i) => i % 2 === 1)
    expect(Math.min(...xs)).toBeGreaterThan(0)
    expect(Math.max(...xs)).toBeLessThan(96)
    expect(Math.min(...ys)).toBeGreaterThan(0)
    expect(Math.max(...ys)).toBeLessThan(88)
  })
})
