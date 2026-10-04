import { describe, expect, it } from 'vitest'
import exampleGuesthouse from '../../data/operators/example-guesthouse.json'
import noorCoffee from '../../data/operators/noor-coffee.json'
import { parseOperatorConfig } from '../../src/operator/config.ts'

const withSummaryPart = (part: { kik: string; en: string }) => ({
  ...noorCoffee,
  summary_templates: { ...noorCoffee.summary_templates, parts: [...noorCoffee.summary_templates.parts, part] },
})

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
    // Prototypes in en, sw, de and fr for every category except Unclear; never Gĩkũyũ.
    for (const reason of config.visit_reasons) {
      if (reason.id === 'unclear') expect(reason.prototypes).toBeUndefined()
      else expect(Object.keys(reason.prototypes!).sort()).toEqual(['de', 'en', 'fr', 'sw'])
    }
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
    ['a category without prototypes', { ...noorCoffee, visit_reasons: noorCoffee.visit_reasons.map((r) => (r.id === 'food' ? { ...r, prototypes: undefined } : r)) }],
    ['two German prototypes only', { ...noorCoffee, visit_reasons: noorCoffee.visit_reasons.map((r) => (r.id === 'food' && r.prototypes ? { ...r, prototypes: { ...r.prototypes, de: r.prototypes.de.slice(0, 2) } } : r)) }],
    ['prototypes on Unclear', { ...noorCoffee, visit_reasons: noorCoffee.visit_reasons.map((r) => (r.id === 'unclear' ? { ...r, prototypes: noorCoffee.visit_reasons[0].prototypes } : r)) }],
    ['a plain string label', { ...noorCoffee, visit_reasons: [{ id: 'other', label: 'Other' }, { id: 'unclear', label: 'Unclear' }] }],
    ['no summary templates', { ...noorCoffee, summary_templates: undefined }],
    ['summary templates not marked for validation', { ...noorCoffee, summary_templates: { ...noorCoffee.summary_templates, status: 'Gĩkũyũ.' } }],
    ['a summary part with an unknown placeholder', withSummaryPart({ kik: 'Ageni: {guests}.', en: 'Guests: {guests}.' })],
    ['a summary part whose meaning uses other placeholders', withSummaryPart({ kik: 'Ageni: {visitors}.', en: 'Visitors.' })],
    ['a summary part with ĩ written as two characters', withSummaryPart({ kik: 'Ageni: {visitors}.'.normalize('NFC') + ' ĩ', en: 'Visitors: {visitors}.' })],
    ['no Gĩkũyũ label for a visit reason', { ...noorCoffee, summary_templates: { ...noorCoffee.summary_templates, labels: { ...noorCoffee.summary_templates.labels, visit_reasons: { food: 'Irio' } } } }],
  ])('rejects a config %s', (_label, raw) => {
    expect(() => parseOperatorConfig(raw)).toThrow(/Invalid operator config/)
  })
})
