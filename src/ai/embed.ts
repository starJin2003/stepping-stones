/** multilingual-e5 expects this on every input. Both sides of a comparison use "query: " (symmetric use). */
export const E5_PREFIX = 'query: '

/** The model call: Transformers.js feature extraction. Returns rows of length `dims[1]` in `data`. */
export type Extractor = (
  texts: string[],
  options: { pooling: 'mean'; normalize: true },
) => Promise<{ data: ArrayLike<number>; dims: number[] }>

export type Embed = (texts: string[]) => Promise<Float32Array[]>

/**
 * Builds embed(), the only function that calls the model. It adds the e5 prefix itself, exactly once
 * (a prefix the caller already added is not doubled), and returns one normalized mean-pooled vector per text.
 */
export function createEmbedder(extractor: Extractor): Embed {
  return async (texts) => {
    if (texts.length === 0) return []
    const inputs = texts.map((t) => E5_PREFIX + t.trim().replace(/^(query|passage):\s*/i, ''))
    const { data, dims } = await extractor(inputs, { pooling: 'mean', normalize: true })
    const [rows, width] = dims
    if (rows !== texts.length) throw new Error(`Expected ${texts.length} embeddings, got ${rows}`)
    return Array.from({ length: rows }, (_, i) => Float32Array.from({ length: width }, (_, j) => data[i * width + j]))
  }
}

/** Cosine similarity. Vectors from embed() are normalized, so this is their dot product. */
export function cosine(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}
