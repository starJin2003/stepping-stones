import { describe, expect, it } from 'vitest'
import { analyseTexts, matchRecords } from '../../src/ai/analyze.ts'
import { KIK_FUNCTION_WORDS, REFERRAL_RULES, THRESHOLDS } from '../../src/ai/config.ts'
import { referralByRules, splitHeard } from '../../src/ai/referral.ts'

const split = (text: string) => splitHeard(text, REFERRAL_RULES)
const rule = (source: string) => referralByRules(source, REFERRAL_RULES)

describe('splitHeard: source span before the first reporting verb, content span after it', () => {
  it.each([
    ['en', 'A man staying at our guesthouse told us Noor still has old coffee trees.', 'A man staying at our guesthouse', 'told', 'us Noor still has old coffee trees.'],
    ['de', 'Eine Reisende aus unserem Gästehaus hat erzählt, dass man die Kirschen selbst pflückt.', 'Eine Reisende aus unserem Gästehaus hat', 'erzählt', 'dass man die Kirschen selbst pflückt.'],
    ['fr', "Un couple de notre maison d'hôtes nous a dit qu'on torréfie le café.", "Un couple de notre maison d'hôtes nous a", 'dit', "qu'on torréfie le café."],
    ['sw', 'Kiongozi wetu wa safari alituambia kuhusu shamba la Noor.', 'Kiongozi wetu wa safari', 'alituambia', 'kuhusu shamba la Noor.'],
  ])('%s', (_lang, text, source, verb, content) => {
    expect(split(text)).toEqual({ source, verb, content })
  })

  it.each([
    ['Our driver suggested the farm on the way to the park.', 'suggested'],
    ['Die Besitzerin hat uns den Hof empfohlen.', 'empfohlen'],
    ['Eine Freundin erzählte uns von der Röstung.', 'erzählte'],
    ['Le gérant nous a conseillé la ferme.', 'conseillé'],
    ["Une amie nous a raconté l'histoire de la ferme.", 'raconté'],
    ['Wageni wenzetu walisema tukae hadi jioni.', 'walisema'],
  ])('finds an inflected reporting verb in %j', (text, verb) => {
    expect(split(text).verb).toBe(verb)
  })

  it('splits at the first verb only', () => {
    expect(split('A friend said the guide told us about the fire.')).toMatchObject({ source: 'A friend', verb: 'said' })
  })

  it('without a reporting verb, both spans are the whole text', () => {
    const text = 'Saw a short video about the farm online.'
    expect(split(text)).toEqual({ source: text, content: text, verb: null })
  })
})

describe('referralByRules on the source span', () => {
  it.each([
    ['guesthouse_guest', 'lodging+guest', 'A man staying at our guesthouse'],
    ['guesthouse_guest', 'lodging+guest', 'Eine Reisende aus unserem Gästehaus'],
    ['guesthouse_guest', 'lodging+guest', "Un couple de notre maison d'hôtes"],
    ['guesthouse_guest', 'lodging+guest', 'Wageni wenzetu kwenye nyumba ya wageni'],
    ['guesthouse_staff', 'lodging+staff', 'The woman who runs our guesthouse'],
    ['guesthouse_staff', 'lodging+staff', 'Die Besitzerin unseres Gästehauses'],
    ['guesthouse_staff', 'lodging+staff', "La propriétaire de notre maison d'hôtes"],
    ['guesthouse_staff', 'lodging+staff', 'Mwenyeji wa nyumba ya wageni'],
    ['local_guide', 'guide', 'Our driver'],
    ['local_guide', 'guide', 'Unser Fahrer'],
    ['local_guide', 'guide', 'Notre guide'],
    ['local_guide', 'guide', 'Kiongozi wetu wa safari'],
    ['friend_family', 'friend_family', 'My sister'],
    ['friend_family', 'friend_family', 'Eine Freundin von mir'],
    ['friend_family', 'friend_family', 'Ma sœur'],
    ['friend_family', 'friend_family', 'Rafiki yangu'],
    ['social_online', 'online', 'Saw a short video about the farm online'],
    ['social_online', 'online', 'Auf einem Reiseblog über Kenia gelesen'],
    ['social_online', 'online', 'Vu sur Instagram'],
    ['social_online', 'online', 'Tuliona picha mtandaoni'],
  ])('%s from %j', (category, firedRule, source) => {
    expect(rule(source)).toEqual({ category, rule: firedRule })
  })

  it('words for two different sources give Unclear, and say which rules fired', () => {
    expect(rule('Our guide saw it online')).toEqual({ category: 'unclear', rule: 'conflict:guide+online' })
    expect(rule('The owner of our guesthouse and another guest')).toEqual({
      category: 'unclear',
      rule: 'conflict:lodging+guest+lodging+staff',
    })
  })

  it('a fellow-guest or staff word counts only next to a lodging word', () => {
    expect(rule('A couple we met on the bus')).toBeNull()
    expect(rule('The owner of a shop in town')).toBeNull()
  })

  it('ignores accents and case, so text typed without them still matches', () => {
    expect(rule('EINE REISENDE AUS UNSEREM GASTEHAUS')?.category).toBe('guesthouse_guest')
  })

  it('fires no rule when no list word is there', () => {
    expect(rule('Somebody at the market')).toBeNull()
  })
})

describe('analysis uses the spans', () => {
  // A fake model: each text has a fixed direction, so tests can tell which text was embedded where.
  const E1 = new Float32Array([1, 0, 0])
  const E2 = new Float32Array([0, 1, 0])
  const E3 = new Float32Array([0, 0, 1])
  const TABLE: Record<string, Float32Array> = {
    'us about the clay pot coffee': E1,
    'Stay for the clay pot coffee': E1,
    'A man staying at our guesthouse told us about the clay pot coffee': E2,
    'A man staying at our guesthouse': E2,
  }
  const embedded: string[] = []
  const embed = async (texts: string[]) => {
    embedded.push(...texts)
    return texts.map((t) => TABLE[t] ?? E3)
  }
  const setup = {
    thresholds: THRESHOLDS,
    functionWords: KIK_FUNCTION_WORDS,
    visitReasonPrototypes: {},
    referralPrototypes: {},
    referralRules: REFERRAL_RULES,
    modelRevision: 'test',
  }
  const prototypes = { visitReasons: [], referrals: [{ category: 'other', vector: E3 }] }

  it('Heard from comes from the rule; the source span is embedded only when no rule fires', async () => {
    embedded.length = 0
    const [ruled, unruled] = await analyseTexts(
      ['1) A man staying at our guesthouse told us about the clay pot coffee 2) Stay', '1) Somebody at the market said to go 2) Stay'],
      setup,
      prototypes,
      embed,
    )
    expect(ruled).toMatchObject({ referral_source_category: 'guesthouse_guest', referral_rule: 'lodging+guest' })
    expect(unruled).toMatchObject({ referral_source_category: 'other', referral_rule: 'embedding' })
    expect(embedded).not.toContain('A man staying at our guesthouse')
    expect(embedded).toContain('Somebody at the market')
  })

  it('matching compares the content span of what the new visitor heard with earlier would-tell text', async () => {
    const raws = [
      '1) aaa 2) Stay for the clay pot coffee',
      '1) bbb 2) A man staying at our guesthouse',
      '1) A man staying at our guesthouse told us about the clay pot coffee 2) x',
    ]
    const readings = await analyseTexts(raws, setup, prototypes, embed)
    expect(readings[2].incoming_embedding).toEqual(E1)
    const records = readings.map((r, i) => ({
      ...r,
      record_id: ['a', 'b', 'new'][i],
      received_at: `2026-09-0${i + 1}T12:00:00.000Z`,
    }))
    const match = matchRecords(records, ['new'], THRESHOLDS.match).get('new')!
    // The whole heard story would point at b; what they heard points at a.
    expect(match.candidate_prior_record_ids[0]).toBe('a')
  })
})
