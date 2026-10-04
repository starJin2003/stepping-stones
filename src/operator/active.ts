// The one place that chooses the operator. To run for another business, point both imports at its files.
import activeConfig from '../../data/operators/noor-coffee.json'
import { parseOperatorConfig } from './config.ts'

export const operator = parseOperatorConfig(activeConfig)

/** Synthetic sample history for demo mode. Loaded on demand so it stays out of the first download. */
export const loadSampleHistoryFile = async (): Promise<unknown> =>
  (await import('../../data/seed/noor-coffee.synthetic.json')).default
