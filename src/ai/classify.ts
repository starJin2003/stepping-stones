import type { Thresholds } from './config.ts'
import { cosine } from './embed.ts'

export const UNCLEAR = 'unclear'

export interface EmbeddedPrototype {
  category: string
  vector: Float32Array
}

export interface Classification {
  category: string
  /** For scripts and calibration only. Never shown in the UI. */
  score: number
  margin: number
}

/**
 * Nearest category by cosine to its closest prototype sentence. Unclear when the best score is below
 * the threshold or too close to the runner-up category.
 */
export function classify(
  vector: Float32Array | null,
  prototypes: EmbeddedPrototype[],
  thresholds: Thresholds['classify'],
): Classification {
  if (!vector || prototypes.length === 0) return { category: UNCLEAR, score: 0, margin: 0 }
  const best = new Map<string, number>()
  for (const p of prototypes) {
    const score = cosine(vector, p.vector)
    if (score > (best.get(p.category) ?? -Infinity)) best.set(p.category, score)
  }
  const [top, runnerUp] = [...best].sort((a, b) => b[1] - a[1])
  const margin = top[1] - (runnerUp?.[1] ?? -1)
  const clear = top[1] >= thresholds.min_score && margin >= thresholds.min_margin
  return { category: clear ? top[0] : UNCLEAR, score: top[1], margin }
}
