import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

describe('operator-specific content stays in data/operators', () => {
  it('no app code outside src/operator/active.ts names the coffee operator', () => {
    const offenders = filesUnder('src')
      .filter((path) => /\.(ts|tsx|css)$/.test(path) && path !== join('src', 'operator', 'active.ts'))
      .filter((path) => /coffee|kahawa|kahũa|noor/i.test(read(path)))
    expect(offenders).toEqual([])
  })

  it("noor-coffee's card questions match the printed card", () => {
    const card = read('docs/card.md')
    const config = JSON.parse(read('data/operators/noor-coffee.json'))
    for (const question of [...config.card_questions.en, ...config.card_questions.sw]) {
      expect(card).toContain(question)
    }
  })
})
