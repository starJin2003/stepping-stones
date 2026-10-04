// Messages between the app and the model worker.

export type ToWorker =
  /** download=false opens the model already on this phone and never touches the network. */
  | { type: 'load'; download: boolean; wasmUrl: string }
  | { type: 'embed'; id: number; texts: string[] }

export type FromWorker =
  /** Bytes read so far across the wasm and the model files. */
  | { type: 'progress'; loaded: number }
  | { type: 'ready' }
  | { type: 'load-failed' }
  | { type: 'embedded'; id: number; vectors: Float32Array[] }
  | { type: 'embed-failed'; id: number }

/** Where Transformers.js keeps the model and tokenizer (its default browser cache name). */
export const MODEL_CACHE = 'transformers-cache'
/** Where the onnxruntime wasm is kept; the service worker's CacheFirst route uses the same name. */
export const WASM_CACHE = 'ort-wasm'
