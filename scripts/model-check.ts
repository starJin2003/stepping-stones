/**
 * Real-model check on this computer: downloads the pinned model once into models/ (gitignored), runs the
 * same src/ai pipeline as the phone over the synthetic seed and both demo SMS, and times embeddings.
 * Scores are printed here for development only; the app never shows them.
 *
 *   npm run model:check
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { env, pipeline } from '@huggingface/transformers'
import noorCoffee from '../data/operators/noor-coffee.json' with { type: 'json' }
import seed from '../data/seed/noor-coffee.synthetic.json' with { type: 'json' }
import { analyseTexts, embedPrototypes, matchRecords } from '../src/ai/analyze.ts'
import type { AnalysisSetup } from '../src/ai/setup.ts'
import { KIK_FUNCTION_WORDS, REFERRAL_PROTOTYPES, REFERRAL_RULES, THRESHOLDS } from '../src/ai/config.ts'
import { createEmbedder, type Extractor } from '../src/ai/embed.ts'
import { MODEL } from '../src/ai/model.ts'
import { parseOperatorConfig, visitReasonPrototypes } from '../src/operator/config.ts'

env.cacheDir = 'models'
env.allowLocalModels = false

const started = performance.now()
const extractor = await pipeline('feature-extraction', MODEL.id, { revision: MODEL.revision, dtype: MODEL.dtype, device: 'cpu' })
console.log(`Model ready in ${((performance.now() - started) / 1000).toFixed(1)} s`)

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]))
console.log('Files in models/:')
for (const f of files('models')) console.log(`  ${f}  ${statSync(f).size} bytes`)

const embed = createEmbedder(extractor as unknown as Extractor)
const setup: AnalysisSetup = {
  thresholds: THRESHOLDS,
  functionWords: KIK_FUNCTION_WORDS,
  visitReasonPrototypes: visitReasonPrototypes(parseOperatorConfig(noorCoffee)),
  referralPrototypes: REFERRAL_PROTOTYPES,
  referralRules: REFERRAL_RULES,
  modelRevision: MODEL.revision,
}
const prototypes = await embedPrototypes(setup, embed)

const DEMO_TIME = '2026-10-04T09:00:00.000Z'
const records = [
  ...seed.records.map((r) => ({ record_id: r.record_id, received_at: r.received_at, raw: r.raw_text_local })),
  ...seed.demo_sms.map((raw, i) => ({ record_id: `demo-${i + 1}`, received_at: DEMO_TIME, raw })),
]
const analyses = await analyseTexts(records.map((r) => r.raw), setup, prototypes, embed)
const analysed = records.map((r, i) => ({ ...r, ...analyses[i] }))
const seedOnly = analysed.filter((r) => !r.record_id.startsWith('demo-'))

const short = (id: string) => (id.startsWith('demo-') ? id : id.slice(-2))
const describe = (r: (typeof analysed)[number], m: ReturnType<typeof matchRecords> extends Map<string, infer M> ? M : never) => {
  const top = m.scores.map((x) => `${short(x.record_id)}:${x.score.toFixed(3)}`).join(' ')
  return [
    `  ${short(r.record_id).padEnd(6)} heard ${r.referral_source_category} (${r.referral_rule})`,
    `         came for ${r.visit_reason_category} / would tell ${r.pass_on_category} / ${r.detected_language}`,
    `         top match ${m.candidate_prior_record_ids[0] ? short(m.candidate_prior_record_ids[0]) : 'none'} ${m.match_strength}  top3 ${top}`,
  ].join('\n')
}

console.log('\nSample visits, each against every earlier visit (heard from with the rule that fired; came for; would tell; top match):')
const seedMatches = matchRecords(seedOnly, seedOnly.map((r) => r.record_id), THRESHOLDS.match)
for (const r of seedOnly) {
  const linked = seed.records.find((s) => s.record_id === r.record_id)?.confirmed_prior_record_id
  console.log(describe(r, seedMatches.get(r.record_id)!) + (linked ? `   (person linked ${short(linked)})` : ''))
}

console.log(`\nDemo SMS against the sample visits (intended match ${short(seed.demo_intended_match)}):`)
for (const demo of analysed.filter((r) => r.record_id.startsWith('demo-'))) {
  const m = matchRecords([...seedOnly, demo], [demo.record_id], THRESHOLDS.match).get(demo.record_id)!
  const margin = m.scores.length > 1 ? (m.scores[0].score - m.scores[1].score).toFixed(3) : 'n/a'
  console.log(describe(demo, m) + `   margin ${margin}`)
}

// Timing: one text at a time (what a single new SMS costs), and in batches of 16.
const sample = records.map((r) => r.raw)
const single: number[] = []
for (const text of sample) {
  const t = performance.now()
  await embed([text])
  single.push(performance.now() - t)
}
single.sort((a, b) => a - b)
const t = performance.now()
await embed(sample.slice(0, 13))
const batch = (performance.now() - t) / 13
console.log(`\nEmbedding time (Node, onnxruntime-node CPU): median ${single[Math.floor(single.length / 2)].toFixed(1)} ms per single text, ${batch.toFixed(1)} ms per text in a batch of 13`)
