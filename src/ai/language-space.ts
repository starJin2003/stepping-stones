import { cosine } from './embed.ts'

// Language-neutral matching. multilingual-e5 places texts in the same language closer together than their
// meaning alone would, so a Kiswahili heard story drifts towards any Kiswahili would-tell story. Two fixes,
// each behind its own switch in thresholds.json: centering by language, and ratio-margin scoring.

/** The FLORES-200 file for each detected language the means are built from. */
export const FLORES_LANGUAGES = {
  English: 'eng_Latn',
  Kiswahili: 'swh_Latn',
  Gikuyu: 'kik_Latn',
  German: 'deu_Latn',
  French: 'fra_Latn',
} as const

/** Mean embedding per detected language name, from FLORES-200 dev (data/ai/language-means.json). */
export type LanguageMeans = Record<string, number[]>

const prepared = new WeakMap<LanguageMeans, { byLanguage: Map<string, Float32Array>; fallback: Float32Array | null }>()

function meansOf(means: LanguageMeans) {
  let p = prepared.get(means)
  if (!p) {
    const vectors = Object.values(means).map((m) => Float32Array.from(m))
    // Unknown (short or mixed text) uses the average of all language means: it removes the direction every
    // language shares without betting on one language, which would push the text towards the others.
    const fallback = vectors.length
      ? Float32Array.from(vectors[0], (_, i) => vectors.reduce((sum, v) => sum + v[i], 0) / vectors.length)
      : null
    p = { byLanguage: new Map(Object.entries(means).map(([language, m]) => [language, Float32Array.from(m)])), fallback }
    prepared.set(means, p)
  }
  return p
}

/** Subtracts the language's mean embedding and renormalizes. Without means, returns the vector unchanged. */
export function center(vector: Float32Array, language: string | null, means: LanguageMeans): Float32Array {
  const p = meansOf(means)
  const mean = (language && p.byLanguage.get(language)) || p.fallback
  if (!mean) return vector
  const out = Float32Array.from(vector, (x, i) => x - mean[i])
  const norm = Math.sqrt(out.reduce((sum, x) => sum + x * x, 0)) || 1
  return out.map((x) => x / norm)
}

/**
 * k for the ratio margin: 4 as in multilingual sentence mining, but never more than half the pool, so in a small
 * pool the neighbourhood is not simply everyone.
 */
export const marginK = (poolSize: number, kMax: number): number => Math.max(1, Math.min(kMax, Math.floor(poolSize / 2)))

/** Mean cosine of `vector` to its k nearest neighbours in `pool`. */
export function neighbourhood(vector: Float32Array, pool: Float32Array[], kMax: number): number {
  if (pool.length === 0) return 0
  const scores = pool.map((v) => cosine(vector, v)).sort((a, b) => b - a)
  const k = marginK(pool.length, kMax)
  return scores.slice(0, k).reduce((sum, s) => sum + s, 0) / k
}

/**
 * Ratio margin (Artetxe and Schwenk, 2019): cos(x, y) divided by the average closeness of x and of y to their own
 * nearest neighbours. A would-tell story that is close to every heard story (a hub) no longer wins by default.
 */
export const ratioMargin = (cos: number, xNeighbourhood: number, yNeighbourhood: number): number => {
  const denominator = (xNeighbourhood + yNeighbourhood) / 2
  return denominator > 0 ? cos / denominator : cos
}
