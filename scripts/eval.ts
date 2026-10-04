/**
 * npm run eval: reports only. FLORES-200 devtest for language ID and cross-lingual retrieval, the synthetic test
 * split for the full pipeline, and embedding time. Runs on onnxruntime-web wasm in Node, like the phone.
 * Writes docs/EVAL.md and docs/eval-results.json. Nothing here is tuned: thresholds come from the dev split.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { KIK_FUNCTION_WORDS, LANGUAGE_MEANS, THRESHOLDS, type Language, type Thresholds } from '../src/ai/config.ts'
import { cosine } from '../src/ai/embed.ts'
import { detectLanguage } from '../src/ai/language.ts'
import { center, FLORES_LANGUAGES, neighbourhood, ratioMargin } from '../src/ai/language-space.ts'
import {
  analyseSet,
  cachedEmbedder,
  linkMetrics,
  loadSet,
  matchSet,
  prototypesFor,
  readingMetrics,
  scored,
  searchThresholds,
  setupWith,
  withMatching,
} from './eval-lib.ts'

const FLORES = 'data/raw/flores200_dataset/devtest'
const readFlores = (code: string) => readFileSync(`${FLORES}/${code}.devtest`, 'utf8').split('\n').filter(Boolean)
const pct = (n: number, d: number) => Math.round((1000 * n) / d) / 10
const { embed, raw } = await cachedEmbedder()

// 1. Language ID on FLORES devtest (the Gĩkũyũ word list was built from dev only).
const lid: Record<string, { n: number; accuracy: number; unknown: number }> = {}
for (const [language, code] of Object.entries(FLORES_LANGUAGES)) {
  const lines = readFlores(code)
  const detected = lines.map((t) => detectLanguage(t, KIK_FUNCTION_WORDS, THRESHOLDS.language))
  lid[language] = {
    n: lines.length,
    accuracy: pct(detected.filter((d) => d === language).length, lines.length),
    unknown: pct(detected.filter((d) => d === 'Unknown').length, lines.length),
  }
}
console.log('Language ID done')

// 2. Cross-lingual retrieval on a fixed sample: every 5th devtest sentence, 200 per language.
const SAMPLE = Array.from({ length: 200 }, (_, i) => i * 5)
const vectors: Record<string, Float32Array[]> = {}
for (const [language, code] of Object.entries(FLORES_LANGUAGES)) {
  const lines = readFlores(code)
  vectors[language] = await embed(SAMPLE.map((i) => lines[i]))
}
type Method = 'plain' | 'centered' | 'centered_margin'
function top1(from: Language, to: Language, method: Method): number {
  const prep = (v: Float32Array, lang: Language) => (method === 'plain' ? v : center(v, lang, LANGUAGE_MEANS))
  const xs = vectors[from].map((v) => prep(v, from))
  const ys = vectors[to].map((v) => prep(v, to))
  const xCrowd = method === 'centered_margin' ? xs.map((x) => neighbourhood(x, ys, 4)) : []
  const yCrowd = method === 'centered_margin' ? ys.map((y) => neighbourhood(y, xs, 4)) : []
  let right = 0
  xs.forEach((x, i) => {
    let best = -Infinity
    let at = -1
    ys.forEach((y, j) => {
      const c = cosine(x, y)
      const s = method === 'centered_margin' ? ratioMargin(c, xCrowd[i], yCrowd[j]) : c
      if (s > best) [best, at] = [s, j]
    })
    if (at === i) right++
  })
  return pct(right, xs.length)
}
const OTHERS: Language[] = ['Gikuyu', 'Kiswahili', 'German', 'French']
const METHODS: Method[] = ['plain', 'centered', 'centered_margin']
const retrieval = Object.fromEntries(
  METHODS.map((m) => [
    m,
    Object.fromEntries(OTHERS.map((x) => [x, { en_to_x: top1('English', x, m), x_to_en: top1(x, 'English', m) }])),
  ]),
)
console.log('Retrieval done')

// 3. The synthetic test split with the final settings, and with both switches off for comparison.
const final = setupWith()
const prototypes = await prototypesFor(final, embed)
const test = await analyseSet(loadSet('test'), final, prototypes, embed)
const reading = readingMetrics(test)
const linksOn = linkMetrics(test, matchSet(test, final))
// Switches off: plain cosine, with its own thresholds found on dev by the same search as npm run calibrate.
const OFF: Thresholds['matching'] = { ...THRESHOLDS.matching, center_by_language: false, ratio_margin: false }
const dev = await analyseSet(loadSet('dev'), final, prototypes, embed)
const offSearch = searchThresholds(scored(dev, OFF))
const offMatch: Thresholds['match'] = {
  ...THRESHOLDS.match,
  strong: offSearch.strong.t,
  strong_margin: offSearch.strong.g,
  possible: offSearch.possible.t,
  possible_margin: offSearch.possible.g,
}
const linksOff = linkMetrics(test, matchSet(test, setupWith(withMatching(THRESHOLDS, OFF, offMatch))))
console.log('Synthetic test done')

// 4. Time per embedding: one short SMS-sized text at a time, 50 runs, after a warm-up.
const TIMING_TEXT = 'A couple staying at our guesthouse told us you roast the beans over the fire and stir them yourself.'
await raw([TIMING_TEXT])
const times: number[] = []
for (let i = 0; i < 50; i++) {
  const t = performance.now()
  await raw([`${TIMING_TEXT} ${i}`])
  times.push(performance.now() - t)
}
times.sort((a, b) => a - b)
const medianMs = Math.round(((times[24] + times[25]) / 2) * 10) / 10

const results = {
  runtime: 'onnxruntime-web (wasm, 1 thread) in Node, same package and version as the phone; Transformers.js tokenizer',
  language_id_flores_devtest: lid,
  retrieval_flores_devtest_top1: { sample: '200 sentences: every 5th line of devtest', ...retrieval },
  synthetic_test: {
    settings: { matching: THRESHOLDS.matching, match: THRESHOLDS.match, classify: THRESHOLDS.classify },
    readings: reading,
    links_switches_on: linksOn,
    links_switches_off: { thresholds_from_dev: offMatch, ...linksOff },
  },
  embedding_ms_median_of_50: medianMs,
}
writeFileSync('docs/eval-results.json', JSON.stringify(results, null, 2) + '\n')

const row = (cells: (string | number | null)[]) => `| ${cells.map((c) => (c === null ? 'n/a' : c)).join(' | ')} |`
const label: Record<Method, string> = { plain: 'Plain cosine', centered: 'Centered by language', centered_margin: 'Centered plus ratio margin' }
const names: Record<string, string> = { Gikuyu: 'Gĩkũyũ', Kiswahili: 'Kiswahili', English: 'English', German: 'German', French: 'French' }
const links = (title: string, m: typeof linksOn) =>
  row([
    title,
    `${m.top1}/${m.linked} (${m.top1_pct}%)`,
    `${m.same_language.top1}/${m.same_language.n}`,
    `${m.cross_language.top1}/${m.cross_language.n}`,
    `${m.correct_strong} right, ${m.wrong_strong} wrong`,
    `${m.correct_possible} right, ${m.wrong_possible} wrong`,
    `${m.ambiguous_unclear}/${m.ambiguous}`,
    `${m.near_miss_wrong_same_language_proposed}/${m.near_misses}`,
  ])

const md = `# Evaluation

Generated by \`npm run eval\` (scripts/eval.ts). Raw numbers: [eval-results.json](eval-results.json).
Runtime: onnxruntime-web on its wasm backend in Node, the same package and version the phone uses, so scores match the phone's (they differ from the native runtime by about 0.004 in cosine). Model: Xenova/multilingual-e5-small, q8.

Data rules: FLORES-200 dev builds things (the Gĩkũyũ function words, the language means); devtest only reports. The synthetic dev split calibrates (\`npm run calibrate\`); the synthetic test split only reports. The demo SMS and the sample history are in neither split.

## Language ID, FLORES-200 devtest

${row(['Language', 'Sentences', 'Accuracy', 'Unknown'])}
${row(['---', '---', '---', '---'])}
${Object.entries(lid).map(([l, v]) => row([names[l], v.n, `${v.accuracy}%`, `${v.unknown}%`])).join('\n')}

Gĩkũyũ comes from a rule (ĩ and ũ, and function words from FLORES dev). franc has no Gĩkũyũ model.

## Cross-lingual retrieval, FLORES-200 devtest, top-1

200 sentences per language (every 5th devtest line). For each sentence, is its translation the nearest of the 200 in the other language?

${row(['Method', ...OTHERS.flatMap((x) => [`English to ${names[x]}`, `${names[x]} to English`])])}
${row(['---', ...OTHERS.flatMap(() => ['---', '---'])])}
${METHODS.map((m) => row([label[m], ...OTHERS.flatMap((x) => [`${retrieval[m][x].en_to_x}%`, `${retrieval[m][x].x_to_en}%`])])).join('\n')}

Centering subtracts each language's mean embedding (from FLORES dev) and renormalizes. Ratio margin (Artetxe and Schwenk, 2019) divides the cosine by how close each side is to its 4 nearest neighbours.

## Synthetic test split (${test.length} records)

Readings with the final settings:

${row(['Reading', 'Right', 'Notes'])}
${row(['---', '---', '---'])}
${row(['Heard from', `${reading.referral.correct}/${reading.referral.n} (${reading.referral.pct}%)`, `${reading.referral.by_rule} decided by word rules (${reading.referral.by_rule_pct}%), ${reading.referral.rule_correct} of them right; the rest by the model`])}
${row(['Came for', `${reading.came_for.correct}/${reading.came_for.n} (${reading.came_for.pct}%)`, 'Unclear counts as wrong unless the gold label is Unclear'])}
${row(['Would tell friends about', `${reading.would_tell.correct}/${reading.would_tell.n} (${reading.would_tell.pct}%)`, ''])}

Links (top-1 is whether the right earlier visitor is ranked first, over records that have one; Strong and Possible count every record, so a Strong on a visitor whose right answer is none or Unclear is wrong):

${row(['Matching', 'Top-1', 'Same language', 'Cross language', 'Strong', 'Possible', 'Ambiguous ending Unclear', 'Near misses with a wrong same-language visitor proposed'])}
${row(['---', '---', '---', '---', '---', '---', '---', '---'])}
${links('Switches off (plain cosine, thresholds from dev)', linksOff)}
${links('Final: centered plus ratio margin', linksOn)}

## Time

Median ${medianMs} ms per embedding of one SMS-sized text, over 50 runs, on this Mac in Node (wasm, 1 thread). The phone's own number is under Setup, "Measure".

## What these numbers do and do not show

- FLORES-200 is clean, edited, single-language text translated from English Wikipedia-style sources. Tourist SMS are short, informal, misspelled, and mix languages. Real code-switching and Sheng are not covered at all.
- The synthetic splits were written by us, by the same person who wrote the prototype sentences and word lists. They are small (40 records each) and share a structure, so one record moves a rate by several points. They show that the pipeline behaves as designed on the cases we wrote. Real visitor messages are untested.
- Gĩkũyũ appears in FLORES only. No tourist SMS here is in Gĩkũyũ, and the Gĩkũyũ summary templates are not evaluated by any number here; they need a native speaker.
- Nothing here measures the human step: every link is still confirmed or rejected by a person.
`
writeFileSync('docs/EVAL.md', md)
console.log(md)
