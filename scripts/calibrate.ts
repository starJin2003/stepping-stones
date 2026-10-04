/**
 * Calibration on the synthetic dev split only (never test). Compares the matching switches, then searches the
 * match and classification thresholds, favouring no wrong Strong labels over coverage. Prints suggestions;
 * src/ai/thresholds.json is edited by hand from them, with a note.
 *
 *   npm run calibrate
 */
import { THRESHOLDS, type Thresholds } from '../src/ai/config.ts'
import { analyseSet, cachedEmbedder, linkMetrics, loadSet, matchSet, prototypesFor, readingMetrics, scored, searchThresholds, setupWith, withMatching } from './eval-lib.ts'

const dev = loadSet('dev')
const { embed } = await cachedEmbedder()
const base = setupWith()
const prototypes = await prototypesFor(base, embed)
const analysed = await analyseSet(dev, base, prototypes, embed)

const COMBOS: Thresholds['matching'][] = [
  { center_by_language: false, ratio_margin: false, margin_k: 4 },
  { center_by_language: true, ratio_margin: false, margin_k: 4 },
  { center_by_language: false, ratio_margin: true, margin_k: 4 },
  { center_by_language: true, ratio_margin: true, margin_k: 4 },
]
const name = (m: Thresholds['matching']) => `center=${m.center_by_language ? 'on ' : 'off'} margin=${m.ratio_margin ? 'on ' : 'off'}`

console.log('Synthetic dev, matching switches (top-1 = right earlier visitor ranked first, over records with a gold link):')
for (const matching of COMBOS) {
  const m = linkMetrics(analysed, matchSet(analysed, setupWith(withMatching(THRESHOLDS, matching))))
  const s = searchThresholds(scored(analysed, matching))
  console.log(
    `  ${name(matching)}  top-1 ${m.top1}/${m.linked} (same ${m.same_language.top1}/${m.same_language.n}, cross ${m.cross_language.top1}/${m.cross_language.n}), near misses with a wrong same-language visitor proposed ${m.near_miss_wrong_same_language_proposed}/${m.near_misses}`,
  )
  console.log(
    `      best Strong >= ${s.strong.t} gap >= ${s.strong.g}: ${s.strong.right} right, ${s.strong.wrong} wrong; Possible >= ${s.possible.t} gap >= ${s.possible.g}: ${s.possible.right} right, ${s.possible.wrong} wrong`,
  )
}

console.log('\nClassification thresholds (Came for and Would tell accuracy on dev):')
let best = { score: 0, margin: 0, correct: -1 }
for (let score = 0.78; score <= 0.865; score += 0.005) for (const margin of [0, 0.0025, 0.005, 0.01, 0.015, 0.02]) {
  const t = { ...THRESHOLDS, classify: { min_score: Number(score.toFixed(3)), min_margin: margin } }
  const m = readingMetrics(await analyseSet(dev, setupWith(t), prototypes, embed))
  const correct = m.came_for.correct + m.would_tell.correct
  if (correct > best.correct) best = { score: Number(score.toFixed(3)), margin, correct }
}
const current = readingMetrics(analysed)
console.log(`  current ${JSON.stringify(THRESHOLDS.classify)}: Came for ${current.came_for.correct}/${current.came_for.n}, Would tell ${current.would_tell.correct}/${current.would_tell.n}`)
console.log(`  best min_score ${best.score}, min_margin ${best.margin}: ${best.correct} right of ${current.came_for.n + current.would_tell.n}`)
console.log(`  referral: ${current.referral.correct}/${current.referral.n}, by rule ${current.referral.by_rule} (${current.referral.rule_correct} right)`)

console.log('\nDev errors (gold vs read), for prototype and word-list fixes:')
for (const r of analysed) {
  const wrong = [
    r.referral_source_category !== r.gold.referral && `heard ${r.gold.referral} read ${r.referral_source_category} (${r.referral_rule})`,
    r.gold.came_for !== null && r.visit_reason_category !== r.gold.came_for && `came ${r.gold.came_for} read ${r.visit_reason_category}`,
    r.gold.would_tell !== null && r.pass_on_category !== r.gold.would_tell && `tell ${r.gold.would_tell} read ${r.pass_on_category}`,
  ].filter(Boolean)
  if (wrong.length) console.log(`  ${r.record_id} ${r.language}: ${wrong.join('; ')}`)
}
