import { describe, expect, it } from 'vitest'
import exampleGuesthouse from '../../data/operators/example-guesthouse.json'
import noorCoffee from '../../data/operators/noor-coffee.json'
import { parseOperatorConfig } from '../../src/operator/config.ts'

describe('operator configs', () => {
  it.each([
    ['noor-coffee', noorCoffee],
    ['example-guesthouse', exampleGuesthouse],
  ])('%s satisfies OperatorConfig and includes Other and Unclear', (id, raw) => {
    const config = parseOperatorConfig(raw)
    expect(config.id).toBe(id)
    const labels = config.visit_reasons.map((r) => r.label.en)
    expect(labels).toContain('Other')
    expect(labels).toContain('Unclear')
    // Every label is translated, Other and Unclear included.
    for (const reason of config.visit_reasons) expect(reason.label.sw).not.toBe(reason.label.en)
    expect(config.card_questions.en).toHaveLength(2)
    expect(config.card_questions.sw).toHaveLength(2)
  })

  it('the example guesthouse has its own categories', () => {
    const coffee = new Set(parseOperatorConfig(noorCoffee).visit_reasons.map((r) => r.id))
    const own = parseOperatorConfig(exampleGuesthouse).visit_reasons.filter((r) => !coffee.has(r.id))
    expect(own.map((r) => r.label.en)).toEqual(['Rooms', 'Location', 'Staff'])
  })

  it.each([
    ['missing Unclear', { ...noorCoffee, visit_reasons: noorCoffee.visit_reasons.filter((r) => r.id !== 'unclear') }],
    ['missing Other', { ...noorCoffee, visit_reasons: noorCoffee.visit_reasons.filter((r) => r.id !== 'other') }],
    ['one card question', { ...noorCoffee, card_questions: { ...noorCoffee.card_questions, en: ['Only one?'] } }],
    ['no owner name', { ...noorCoffee, owner_name: '' }],
    ['a label without Kiswahili', { ...noorCoffee, visit_reasons: [{ id: 'other', label: { en: 'Other' } }, { id: 'unclear', label: { sw: 'Haiko wazi', en: 'Unclear' } }] }],
    ['a plain string label', { ...noorCoffee, visit_reasons: [{ id: 'other', label: 'Other' }, { id: 'unclear', label: 'Unclear' }] }],
  ])('rejects a config %s', (_label, raw) => {
    expect(() => parseOperatorConfig(raw)).toThrow(/Invalid operator config/)
  })
})
