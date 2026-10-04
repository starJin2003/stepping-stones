// Runs the embedding model off the main thread. The only network use is an explicit download.
import { env, pipeline } from '@huggingface/transformers'
import { createEmbedder, type Embed, type Extractor } from './embed.ts'
import { MODEL } from './model.ts'
import { MODEL_CACHE, WASM_CACHE, type FromWorker, type ToWorker } from './protocol.ts'

env.allowLocalModels = false
env.useBrowserCache = true
env.cacheKey = MODEL_CACHE
// We cache the wasm ourselves (and the service worker caches /ort/), so Transformers.js must not keep a second copy.
env.useWasmCache = false
const ortWasm = env.backends.onnx.wasm!
ortWasm.numThreads = 1
ortWasm.proxy = false

let embed: Embed | null = null
const networkFetch = env.fetch
/** Used while opening the model from this phone: any attempt to reach the network fails instead of happening. */
const refuseNetwork: typeof env.fetch = (url) => Promise.reject(new Error(`Not fetching ${String(url)}: the model opens from this phone`))

const post = (message: FromWorker, transfer: Transferable[] = []) => self.postMessage(message, { transfer })

async function readAll(response: Response, onBytes: (loaded: number) => void): Promise<ArrayBuffer> {
  const reader = response.body!.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    onBytes(loaded)
  }
  const bytes = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes.buffer
}

/** The wasm from Cache Storage, or (only when downloading) from our own origin, stored for next time. */
async function wasmBinary(url: string, download: boolean, onBytes: (loaded: number) => void): Promise<ArrayBuffer> {
  const cache = await caches.open(WASM_CACHE)
  const cached = await cache.match(url)
  if (cached) {
    const bytes = await cached.arrayBuffer()
    onBytes(bytes.byteLength)
    return bytes
  }
  if (!download) throw new Error('wasm is not on this phone')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`wasm download failed: ${response.status}`)
  const bytes = await readAll(response, onBytes)
  // Stored where the service worker's CacheFirst route looks, whether or not it saw this fetch.
  await cache.put(url, new Response(bytes, { headers: { 'content-type': 'application/wasm' } }))
  return bytes
}

async function load(download: boolean, wasmUrl: string) {
  const loaded = new Map<string, number>()
  let lastPost = 0
  const report = (file: string, bytes: number) => {
    loaded.set(file, bytes)
    if (Date.now() - lastPost < 150) return
    lastPost = Date.now()
    post({ type: 'progress', loaded: [...loaded.values()].reduce((a, b) => a + b, 0) })
  }

  ortWasm.wasmPaths = { wasm: wasmUrl }
  ortWasm.wasmBinary = await wasmBinary(wasmUrl, download, (n) => report('wasm', n))

  // Opening what is already on the phone must never reach the network. Every network call Transformers.js makes goes
  // through env.fetch, so it is swapped for one that refuses. (Turning off allowRemoteModels is not an option:
  // Transformers.js 4.3 rejects that together with allowLocalModels=false, even when everything is cached.)
  env.fetch = download ? networkFetch : refuseNetwork
  const extractor = await pipeline('feature-extraction', MODEL.id, {
    revision: MODEL.revision,
    dtype: MODEL.dtype,
    device: 'wasm',
    // Only while downloading: progress also asks the Hub for file sizes.
    progress_callback: download
      ? (info) => {
          if (info.status === 'progress') report(info.file, info.loaded)
        }
      : undefined,
  })
  embed = createEmbedder(extractor as unknown as Extractor)
  post({ type: 'ready' })
}

self.addEventListener('message', async (event: MessageEvent<ToWorker>) => {
  const message = event.data
  if (message.type === 'load') {
    try {
      await load(message.download, message.wasmUrl)
    } catch (err) {
      // About model files only; never contains message text.
      console.error('Model load failed:', err instanceof Error ? err.message : String(err))
      post({ type: 'load-failed' })
    }
  } else if (message.type === 'embed') {
    try {
      if (!embed) throw new Error('model not loaded')
      const vectors = await embed(message.texts)
      post({ type: 'embedded', id: message.id, vectors }, vectors.map((v) => v.buffer))
    } catch {
      post({ type: 'embed-failed', id: message.id })
    }
  }
})
