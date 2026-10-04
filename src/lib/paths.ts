import { buildChains, type ChainRecord } from './chains.ts'

/** Stones drawn per path before the earlier ones fold away. */
export const STONES_SHOWN = 5
/** A path with no new stone for this long folds under "Earlier paths". */
export const QUIET_DAYS = 60
/** Outline pebbles drawn for visitors with no confirmed link; the rest are a count. */
export const PEBBLES_SHOWN = 10

const DAY_MS = 24 * 60 * 60 * 1000

export interface StonesLayout<R extends ChainRecord> {
  /** Paths with a recent stone, the one with the newest stone first. */
  active: R[][]
  /** Paths quiet for QUIET_DAYS, newest first. */
  earlier: R[][]
  /** Visitors in no path, newest first. */
  unlinked: R[]
}

const newest = (records: readonly ChainRecord[]) => Math.max(...records.map((r) => Date.parse(r.received_at)))

/**
 * How the Stones tab arranges visitors. Quiet is measured against the newest visit on the phone, not the
 * clock, so a season with no visitors does not fold away every path.
 */
export function layoutStones<R extends ChainRecord>(records: readonly R[]): StonesLayout<R> {
  const chains = buildChains(records)
  const inPath = new Set(chains.flat().map((r) => r.record_id))
  const latest = records.length ? newest(records) : 0
  const isQuiet = (chain: R[]) => latest - Date.parse(chain[chain.length - 1].received_at) > QUIET_DAYS * DAY_MS
  return {
    active: chains.filter((chain) => !isQuiet(chain)),
    earlier: chains.filter(isQuiet),
    unlinked: records
      .filter((r) => !inPath.has(r.record_id))
      .sort((a, b) => Date.parse(b.received_at) - Date.parse(a.received_at)),
  }
}

/** The stones a path draws: its most recent ones, unless a person opened the earlier ones. */
export function visibleStones<R>(chain: R[], showAll: boolean): { shown: R[]; hidden: number } {
  const hidden = showAll ? 0 : Math.max(0, chain.length - STONES_SHOWN)
  return { shown: chain.slice(hidden), hidden }
}

/** The pebbles drawn for visitors with no link yet, and how many more there are. */
export function visiblePebbles<R>(unlinked: R[]): { shown: R[]; more: number } {
  return { shown: unlinked.slice(0, PEBBLES_SHOWN), more: Math.max(0, unlinked.length - PEBBLES_SHOWN) }
}
