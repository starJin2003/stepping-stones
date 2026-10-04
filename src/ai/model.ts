// The on-device embedding model.
export const MODEL = {
  id: 'Xenova/multilingual-e5-small',
  // Transformers.js 4.3 looks up config.json and tokenizer_config.json at "main" even when another revision
  // is passed, so a pinned revision would leave those lookups uncached and break the offline load.
  revision: 'main',
  /** The Hub commit the sizes below were measured at (2025-07-22). */
  measuredAtCommit: '761b726dd34fb83930e26aab4e9ac3899aa1fa78',
  dtype: 'q8',
  /** Every file Transformers.js downloads for feature extraction, with exact sizes from the Hub. */
  files: [
    { path: 'onnx/model_quantized.onnx', bytes: 118_308_185 },
    { path: 'tokenizer.json', bytes: 17_082_730 },
    { path: 'config.json', bytes: 658 },
    { path: 'tokenizer_config.json', bytes: 443 },
  ],
} as const

/** The URL Transformers.js fetches, which is also its Cache Storage key in the browser. */
export const modelFileUrl = (path: string): string =>
  `https://huggingface.co/${MODEL.id}/resolve/${MODEL.revision}/${path}`

export const MODEL_FILES_BYTES = MODEL.files.reduce((sum, f) => sum + f.bytes, 0)

/** Megabytes as people read them on a data plan (10^6 bytes). */
export const toMB = (bytes: number): number => Math.round(bytes / 1_000_000)
