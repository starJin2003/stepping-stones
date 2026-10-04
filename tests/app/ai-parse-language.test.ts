import { describe, expect, it } from 'vitest'
import { KIK_FUNCTION_WORDS, plainWord, THRESHOLDS } from '../../src/ai/config.ts'
import { detectLanguage } from '../../src/ai/language.ts'
import { parse } from '../../src/ai/parse.ts'

describe('parse', () => {
  it.each([
    ['1) heard this 2) would tell that'],
    ['1. heard this 2. would tell that'],
    ['1: heard this 2: would tell that'],
    ['(1) heard this (2) would tell that'],
    ['  1 )   heard this    2 )  would tell that  '],
    ['( 1 ) heard this\n( 2 ) would tell that'],
    ['1)heard this 2)would tell that'],
  ])('splits %j', (raw) => {
    expect(parse(raw)).toEqual({ incoming_story_text: 'heard this', outgoing_story_text: 'would tell that', format_ok: true })
  })

  it('does not mistake numbers inside the answers for markers', () => {
    expect(parse('1) We came 11) times, at 1:30, walked 1.5 km 2) Go at 2.30 pm')).toEqual({
      incoming_story_text: 'We came 11) times, at 1:30, walked 1.5 km',
      outgoing_story_text: 'Go at 2.30 pm',
      format_ok: true,
    })
  })

  it.each([
    ['no markers at all', 'A friend told me about the farm. Lovely day.'],
    ['only the first marker', '1) A friend told me about the farm.'],
    ['only the second marker', 'A friend told me 2) lovely day'],
    ['markers in the wrong order', '2) lovely day 1) a friend told me'],
  ])('without both markers (%s), keeps the whole text as incoming and flags the format', (_label, raw) => {
    expect(parse(raw)).toEqual({ incoming_story_text: raw.trim(), outgoing_story_text: '', format_ok: false })
  })
})

describe('detectLanguage', () => {
  const detect = (text: string) => detectLanguage(text, KIK_FUNCTION_WORDS, THRESHOLDS.language)

  it.each([
    ['English', 'A friend at my hostel told me about the coffee tour and the tasting.'],
    ['Kiswahili', 'Rafiki yangu aliniambia kuhusu ziara ya shamba na kahawa nzuri sana.'],
    ['German', 'Eine Freundin hat mir von der Kaffeetour erzählt, es war wunderschön.'],
    ['French', "Un ami m'a parlé de la visite de la ferme et du café, c'était très bien."],
  ])('recognises %s', (language, text) => {
    expect(detect(text)).toBe(language)
  })

  // From FLORES-200 dev, kik_Latn (CC BY-SA 4.0). The function-word list is built from dev, so devtest stays unseen.
  const GIKUYU = 'Record ĩrĩa yaigĩtwo nĩ Nadal kũrĩ mũthaki wa Canada yarĩ mũgwanja kwa igĩrĩ.'
  const GIKUYU_2 = 'Nyũmba cia mohoro cia matũra-inĩ macio ĩkĩanĩrĩra atĩ ngaari ĩmwe ya kũhoria mwaki kĩharoinĩ'

  it('recognises Gĩkũyũ written with ĩ and ũ', () => {
    expect(detect(GIKUYU)).toBe('Gikuyu')
    expect(detect(GIKUYU_2)).toBe('Gikuyu')
  })

  it('recognises Gĩkũyũ typed without ĩ and ũ, from function words', () => {
    expect(plainWord(GIKUYU)).not.toMatch(/[ĩũ]/)
    expect(detect(plainWord(GIKUYU))).toBe('Gikuyu')
    expect(detect(plainWord(GIKUYU_2))).toBe('Gikuyu')
  })

  it('keeps an English message that quotes a few Gĩkũyũ words as English', () => {
    expect(detect('I learned to say Gĩkũyũ words like "thengiũ" from our host, and we had a lovely time.')).toBe('English')
  })

  it.each(['Hi', 'Asante sana', 'Great tour!', '1) yes 2) no'])('returns Unknown for short text %j', (text) => {
    expect(detect(text)).toBe('Unknown')
  })
})
