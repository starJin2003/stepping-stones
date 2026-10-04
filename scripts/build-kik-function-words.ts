/**
 * Builds data/lid/kik-function-words.json from FLORES-200 dev only (devtest is held out for evaluation).
 * A word qualifies when it appears in many Gĩkũyũ dev sentences and almost never in the English, Kiswahili,
 * German, or French dev sentences. The comparison ignores accents, so text typed without ĩ ũ still matches.
 *
 *   curl -L -o data/raw/flores200_dataset.tar.gz https://dl.fbaipublicfiles.com/nllb/flores200_dataset.tar.gz
 *   tar -xzf data/raw/flores200_dataset.tar.gz -C data/raw
 *   npm run lid:words
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const DEV = 'data/raw/flores200_dataset/dev'
const OTHERS = ['eng_Latn', 'swh_Latn', 'deu_Latn', 'fra_Latn']
// A word must be in at least 2.5% of Gĩkũyũ sentences and at most 0.3% of each other language's sentences.
const MIN_KIK_SHARE = 0.025
const MAX_OTHER_SHARE = 0.003
const MAX_WORDS = 80

const tokens = (line: string) => line.normalize('NFC').toLowerCase().match(/\p{L}+/gu) ?? []
const plain = (word: string) => word.normalize('NFD').replace(/\p{M}/gu, '')

/** Share of sentences that contain each word (each word counted once per sentence). */
function sentenceShare(file: string, key: (w: string) => string): { share: Map<string, number>; sentences: number } {
  const lines = readFileSync(`${DEV}/${file}.dev`, 'utf8').split('\n').filter((l) => l.trim())
  const counts = new Map<string, number>()
  for (const line of lines) for (const w of new Set(tokens(line).map(key))) counts.set(w, (counts.get(w) ?? 0) + 1)
  return { share: new Map([...counts].map(([w, n]) => [w, n / lines.length])), sentences: lines.length }
}

const kik = sentenceShare('kik_Latn', (w) => w)
const others = OTHERS.map((lang) => sentenceShare(lang, plain).share)

const words = [...kik.share]
  .filter(([w, share]) => w.length >= 2 && share >= MIN_KIK_SHARE)
  .filter(([w]) => others.every((other) => (other.get(plain(w)) ?? 0) <= MAX_OTHER_SHARE))
  .sort((a, b) => b[1] - a[1])
  .slice(0, MAX_WORDS)
  .map(([word, share]) => ({ word, kik_sentence_share: Number(share.toFixed(3)) }))

mkdirSync('data/lid', { recursive: true })
writeFileSync(
  'data/lid/kik-function-words.json',
  JSON.stringify(
    {
      description:
        'Gĩkũyũ function words for the rule-based language detector: frequent in Gĩkũyũ, rare in English, Kiswahili, German and French.',
      source: 'FLORES-200 (NLLB Team, Meta AI), dev split, file kik_Latn.dev',
      url: 'https://dl.fbaipublicfiles.com/nllb/flores200_dataset.tar.gz',
      license: 'CC BY-SA 4.0',
      split_used: `dev only (${kik.sentences} kik_Latn sentences). devtest is held out for evaluation.`,
      method: `Words in at least ${MIN_KIK_SHARE * 100}% of kik_Latn dev sentences and at most ${MAX_OTHER_SHARE * 100}% of each of ${OTHERS.join(', ')} dev sentences, compared without accents. Top ${MAX_WORDS} by Gĩkũyũ share.`,
      generated_by: 'scripts/build-kik-function-words.ts',
      words,
    },
    null,
    2,
  ) + '\n',
)
console.log(`${words.length} words:`, words.map((w) => w.word).join(' '))
