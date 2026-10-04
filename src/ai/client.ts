// The app's side of the model: whether it is on this phone, the opt-in download, embedding, and deletion.
import { useSyncExternalStore } from 'react'
import { MODEL, MODEL_FILES_BYTES, modelFileUrl } from './model.ts'
import { MODEL_CACHE, WASM_CACHE, type FromWorker, type ToWorker } from './protocol.ts'

/** The real total a download costs: model, tokenizer and configs, plus the onnxruntime wasm. */
export const DOWNLOAD_BYTES = MODEL_FILES_BYTES + __ORT_WASM__.bytes
const WASM_URL = new URL(__ORT_WASM__.path, self.location.origin).href

export type ModelStatus =
  | { kind: 'checking' }
  | { kind: 'absent' }
  | { kind: 'downloading'; loaded: number }
  /** On this phone, being opened. */
  | { kind: 'opening' }
  | { kind: 'ready' }
  | { kind: 'failed'; during: 'download' | 'open' }

let status: ModelStatus = { kind: 'checking' }
const listeners = new Set<() => void>()
const setStatus = (next: ModelStatus) => {
  status = next
  for (const listener of listeners) listener()
}

export function useModelStatus(): ModelStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => status,
  )
}

let worker: Worker | null = null
let nextId = 0
const waiting = new Map<number, { resolve: (v: Float32Array[]) => void; reject: (e: Error) => void }>()
const counting = new Map<number, (requests: number) => void>()

function startWorker(download: boolean) {
  stopWorker()
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  worker.addEventListener('message', (event: MessageEvent<FromWorker>) => {
    const message = event.data
    switch (message.type) {
      case 'progress':
        if (status.kind === 'downloading') setStatus({ kind: 'downloading', loaded: Math.min(message.loaded, DOWNLOAD_BYTES) })
        break
      case 'ready':
        setStatus({ kind: 'ready' })
        break
      case 'load-failed':
        setStatus({ kind: 'failed', during: download ? 'download' : 'open' })
        break
      case 'embedded':
        waiting.get(message.id)?.resolve(message.vectors)
        waiting.delete(message.id)
        break
      case 'embed-failed':
        waiting.get(message.id)?.reject(new Error('embedding failed'))
        waiting.delete(message.id)
        break
      case 'net-count':
        counting.get(message.id)?.(message.requests)
        counting.delete(message.id)
        break
    }
  })
  worker.postMessage({ type: 'load', download, wasmUrl: WASM_URL } satisfies ToWorker)
}

function stopWorker() {
  worker?.terminate()
  worker = null
  for (const { reject } of waiting.values()) reject(new Error('model stopped'))
  waiting.clear()
}

/** True only when every model file and the wasm are in Cache Storage. Never uses the network. */
export async function isModelOnPhone(): Promise<boolean> {
  if (!('caches' in self) || !(await caches.has(MODEL_CACHE)) || !(await caches.has(WASM_CACHE))) return false
  const [models, wasm] = await Promise.all([caches.open(MODEL_CACHE), caches.open(WASM_CACHE)])
  const found = await Promise.all([...MODEL.files.map((f) => models.match(modelFileUrl(f.path))), wasm.match(WASM_URL)])
  return found.every(Boolean)
}

/** At app start: open the model if it is already here. Never downloads. */
export async function initModel(): Promise<void> {
  if (await isModelOnPhone()) {
    setStatus({ kind: 'opening' })
    startWorker(false)
  } else {
    setStatus({ kind: 'absent' })
  }
}

/** Only ever called from the download button. Returns false without signal. */
export function downloadModel(): boolean {
  if (!navigator.onLine) return false
  setStatus({ kind: 'downloading', loaded: 0 })
  startWorker(true)
  return true
}

export async function deleteModel(): Promise<void> {
  stopWorker()
  await Promise.all([caches.delete(MODEL_CACHE), caches.delete(WASM_CACHE)])
  setStatus({ kind: 'absent' })
}

/** Short messages in four languages for the Measure check. Not about any operator. */
const MEASURE_SAMPLE = [
  'A couple staying at our guesthouse told us about the walk up the hill and the family lunch.',
  'Rafiki yangu aliniambia kuhusu matembezi shambani na chakula cha mchana cha familia.',
  'Eine Reisende aus unserem Hostel hat uns von dem Spaziergang und dem Mittagessen erzählt.',
  "Notre guide nous a dit que la visite finit par un repas avec la famille.",
]

export interface Measurement {
  runs: number
  /** Median milliseconds to embed one message, from the page's side. */
  medianMs: number
  /** Resource requests seen in the page and in the model worker during the runs. Must be 0. */
  networkRequests: number
}

/** Embeds a fixed sample `runs` times, one message at a time, and counts network requests in page and worker. */
export async function measureOnDevice(runs = 20): Promise<Measurement> {
  if (!worker || status.kind !== 'ready') throw new Error('model not ready')
  let pageRequests = 0
  const pageWatch = new PerformanceObserver((list) => {
    pageRequests += list.getEntries().length
  })
  pageWatch.observe({ type: 'resource' })
  worker.postMessage({ type: 'net-watch-start' } satisfies ToWorker)

  const times: number[] = []
  try {
    for (let i = 0; i < runs; i++) {
      const started = performance.now()
      await embedOnDevice([MEASURE_SAMPLE[i % MEASURE_SAMPLE.length]])
      times.push(performance.now() - started)
    }
  } finally {
    pageRequests += pageWatch.takeRecords().length
    pageWatch.disconnect()
  }
  const id = nextId++
  const workerRequests = await new Promise<number>((resolve) => {
    counting.set(id, resolve)
    worker!.postMessage({ type: 'net-watch-stop', id } satisfies ToWorker)
  })
  times.sort((a, b) => a - b)
  const mid = Math.floor(times.length / 2)
  const medianMs = times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2
  return { runs, medianMs: Math.round(medianMs), networkRequests: pageRequests + workerRequests }
}

/** Sends texts to embed() in the worker, which adds the e5 prefix. */
export function embedOnDevice(texts: string[]): Promise<Float32Array[]> {
  if (!worker || status.kind !== 'ready') return Promise.reject(new Error('model not ready'))
  const id = nextId++
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    worker!.postMessage({ type: 'embed', id, texts } satisfies ToWorker)
  })
}
