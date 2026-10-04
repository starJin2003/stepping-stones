import { describe, expect, it } from 'vitest'
import referral from '../../data/ai/referral-prototypes.json'
import kikWords from '../../data/lid/kik-function-words.json'
import { PROTOTYPE_LANGS } from '../../src/ai/config.ts'
import { REFERRAL_SOURCES } from '../../src/i18n/strings.ts'

describe('analysis data files', () => {
  it('has 3 to 5 referral prototypes per source and language, for every source except Unclear', () => {
    const sources = REFERRAL_SOURCES.filter((s) => s !== 'unclear')
    expect(Object.keys(referral.categories).sort()).toEqual([...sources].sort())
    for (const [source, langs] of Object.entries(referral.categories)) {
      expect(Object.keys(langs).sort(), source).toEqual([...PROTOTYPE_LANGS].sort())
      for (const sentences of Object.values(langs)) expect(sentences.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('records where the Gĩkũyũ function words came from', () => {
    expect(kikWords.source).toContain('FLORES-200')
    expect(kikWords.license).toBe('CC BY-SA 4.0')
    expect(kikWords.split_used).toMatch(/^dev only/)
    expect(kikWords.words.length).toBeGreaterThan(20)
  })
})
