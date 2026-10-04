import { describe, expect, it } from 'vitest'
import exampleGuesthouse from '../../data/operators/example-guesthouse.json'
import noorCoffee from '../../data/operators/noor-coffee.json'
import { REFERRAL_SOURCES, referralKey, STRINGS, translate } from '../../src/i18n/strings.ts'

const EM_DASH = '—'
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('UI strings', () => {
  it('sw and en have exactly the same keys', () => {
    const sw = Object.keys(STRINGS.sw).sort()
    const en = Object.keys(STRINGS.en).sort()
    expect(sw.filter((k) => !en.includes(k))).toEqual([])
    expect(en.filter((k) => !sw.includes(k))).toEqual([])
  })

  it('no string is empty or contains an em dash', () => {
    for (const [lang, table] of Object.entries(STRINGS)) {
      for (const [key, value] of Object.entries(table)) {
        expect(value.trim(), `${lang}.${key}`).not.toBe('')
        expect(value, `${lang}.${key}`).not.toContain(EM_DASH)
      }
    }
  })

  it('each key uses the same placeholders in both languages', () => {
    for (const key of Object.keys(STRINGS.sw) as (keyof typeof STRINGS.sw)[]) {
      expect(placeholders(STRINGS.en[key]), key).toEqual(placeholders(STRINGS.sw[key]))
    }
  })

  it('fills placeholders and leaves unknown ones visible', () => {
    expect(translate('sw', 'todo_other', { n: 2 })).toBe('Jumbe 2 za kukagua')
    expect(translate('en', 'todo_other', { n: 2 })).toBe('2 messages to check')
    expect(translate('en', 'todo_other')).toBe('{n} messages to check')
  })

  it('has both labels for every referral source', () => {
    for (const source of REFERRAL_SOURCES) {
      expect(STRINGS.sw[referralKey(source)]).toBeTruthy()
      expect(STRINGS.en[referralKey(source)]).toBeTruthy()
    }
  })

  it('operator labels and card questions have no em dash either', () => {
    expect(JSON.stringify([noorCoffee, exampleGuesthouse])).not.toContain(EM_DASH)
  })
})
