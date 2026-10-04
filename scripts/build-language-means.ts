/**
 * Builds data/ai/language-means.json: the mean e5 embedding of each language's FLORES-200 dev sentences,
 * through the same embed() and wasm runtime as the phone. Matching subtracts the detected language's mean so
 * two texts do not look alike just because they share a language. devtest stays held out for npm run eval.
 *
 *   npm run ai:means   (needs data/raw/flores200_dataset, see scripts/build-kik-function-words.ts)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { embedInBatches } from '../src/ai/analyze.ts'
import { createEmbedder } from '../src/ai/embed.ts'
import { FLORES_LANGUAGES } from '../src/ai/language-space.ts'
import { MODEL } from '../src/ai/model.ts'
import { wasmExtractor } from './wasm-embed.ts'

const embed = createEmbedder(await wasmExtractor())
const means: Record<string, number[]> = {}
let sentences = 0

for (const [language, code] of Object.entries(FLORES_LANGUAGES)) {
  const lines = readFileSync(`data/raw/flores200_dataset/dev/${code}.dev`, 'utf8').split('\n').filter(Boolean)
  sentences = lines.length
  const vectors = await embedInBatches(lines, embed)
  const mean = new Array<number>(vectors[0].length).fill(0)
  for (const v of vectors) for (let i = 0; i < v.length; i++) mean[i] += v[i] / vectors.length
  means[language] = mean.map((x) => Number(x.toFixed(5)))
  console.log(`${language} (${code}): ${lines.length} sentences`)
}

writeFileSync(
  'data/ai/language-means.json',
  JSON.stringify(
    {
      description:
        'Mean embedding per language, subtracted before matching (then renormalized) so two texts do not score high just for sharing a language. Unknown uses the average of the five means: it removes the direction all languages share without betting on one language.',
      source: 'FLORES-200 dev split (NLLB Team et al., 2022), files eng_Latn, swh_Latn, kik_Latn, deu_Latn, fra_Latn',
      license: 'CC BY-SA 4.0',
      split_used: 'dev only; devtest is held out for npm run eval',
      sentences_per_language: sentences,
      model: `${MODEL.id} (${MODEL.dtype}), "query: " prefix, mean pooling, normalized, onnxruntime-web wasm`,
      rounding: '5 decimals',
      means,
    },
    null,
    1,
  ) + '\n',
)
console.log('Wrote data/ai/language-means.json')
