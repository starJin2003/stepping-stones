/**
 * The phone's runtime in Node: onnxruntime-web on its wasm backend (the same package and version Transformers.js
 * uses in the browser), single-threaded like the worker, with Transformers.js only for the tokenizer.
 * Transformers.js in Node offers only cpu (onnxruntime-node), coreml or webgpu, so the session is opened here.
 * Returns an Extractor, so src/ai/embed.ts adds the e5 prefix exactly as on the phone.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AutoTokenizer, env, pipeline } from '@huggingface/transformers'
import * as ort from 'onnxruntime-web'
import type { Extractor } from '../src/ai/embed.ts'
import { MODEL } from '../src/ai/model.ts'

env.cacheDir = 'models'
env.allowLocalModels = false

export async function wasmExtractor(): Promise<Extractor> {
  const modelPath = join('models', MODEL.id, 'onnx', 'model_quantized.onnx')
  // The first run fetches the model files into models/ (gitignored) through Transformers.js.
  if (!existsSync(modelPath)) await pipeline('feature-extraction', MODEL.id, { revision: MODEL.revision, dtype: MODEL.dtype, device: 'cpu' })
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL.id, { revision: MODEL.revision })
  ort.env.wasm.numThreads = 1
  const session = await ort.InferenceSession.create(readFileSync(modelPath), { executionProviders: ['wasm'] })

  return async (texts) => {
    const encoded = tokenizer(texts, { padding: true, truncation: true }) as unknown as Record<
      string,
      { data: BigInt64Array; dims: number[] }
    >
    const feeds: Record<string, ort.Tensor> = {}
    for (const name of session.inputNames) {
      const source = encoded[name] ?? { data: new BigInt64Array(encoded.input_ids.data.length), dims: encoded.input_ids.dims }
      feeds[name] = new ort.Tensor('int64', source.data, source.dims)
    }
    const output = (await session.run(feeds))[session.outputNames[0]]
    const [batch, length, width] = output.dims as number[]
    const hidden = output.data as Float32Array
    const mask = encoded.attention_mask.data
    const data = new Float32Array(batch * width)
    // Mean pooling over real tokens, then L2 normalization: what the pipeline does with { pooling: 'mean', normalize: true }.
    for (let b = 0; b < batch; b++) {
      let count = 0
      for (let t = 0; t < length; t++) {
        if (mask[b * length + t] === 0n) continue
        count++
        for (let d = 0; d < width; d++) data[b * width + d] += hidden[(b * length + t) * width + d]
      }
      let norm = 0
      for (let d = 0; d < width; d++) {
        data[b * width + d] /= count
        norm += data[b * width + d] ** 2
      }
      norm = Math.sqrt(norm) || 1
      for (let d = 0; d < width; d++) data[b * width + d] /= norm
    }
    return { data, dims: [batch, width] }
  }
}
