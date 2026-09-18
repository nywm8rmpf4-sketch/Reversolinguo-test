import { describe, expect, it } from 'vitest'
import { validateCatalogBundle } from '../../src/content/contracts'

function entry(id: string, level: 'PRE-A1' | 'A1' | 'A2' | 'B1' | 'B2', senseKey?: string) {
  return {
    entry_id: id,
    language_tag: 'es',
    lemma: senseKey ? 'la salsa' : `lema-${level}-${id.slice(-1)}`,
    ...(senseKey ? { sense_key: senseKey } : {}),
    part_of_speech: 'noun',
    senses: [{
      sense_id: 's1',
      translations: [`traduction-${level}-${id.slice(-1)}`],
      example_source: 'Ejemplo.',
      example_target: 'Exemple.'
    }],
    cefr_level: level,
    cefr_rationale: 'fixture',
    themes: ['description'],
    provenance: { source: 'fixture', license: 'CC BY 4.0', authored_by: 'fixture' },
    status: 'draft',
    version: 1
  }
}

function manifest(level: 'PRE-A1' | 'A1' | 'A2' | 'B1' | 'B2', count: number) {
  return {
    catalog_id: 'fixture',
    catalog_version: 'fixture-v1',
    source_language: 'es',
    target_language: 'fr',
    cefr_level: level,
    entry_count: count,
    license: 'CC BY 4.0',
    schema_id: 'https://reversolinguo.app/schemas/lexical-entry-v2.json',
    min_app_version: '0.1.0',
    catalog_sha256: '0'.repeat(64),
    status: 'draft-human-review',
    human_review: 'NOT_EXECUTED'
  }
}

describe('cumulative catalog contract', () => {
  it('treats manifest cefr_level as the maximum level of a cumulative bundle', () => {
    const entries = [
      entry('11111111-1111-5111-8111-111111111111', 'A1'),
      entry('22222222-2222-5222-8222-222222222222', 'A2')
    ]
    expect(validateCatalogBundle(entries, manifest('A2', 2))).toEqual({ valid: true, errors: [] })
  })

  it('fails closed when a cumulative bundle contains an entry above the declared maximum', () => {
    const entries = [
      entry('11111111-1111-5111-8111-111111111111', 'A1'),
      entry('33333333-3333-5333-8333-333333333333', 'B1')
    ]
    const result = validateCatalogBundle(entries, manifest('A2', 2))
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('level-above-manifest:33333333-3333-5333-8333-333333333333')
  })

  it('accepts homograph entries only when their semantic identity is discriminated', () => {
    const base = entry('44444444-4444-5444-8444-444444444444', 'A2')
    base.lemma = 'la salsa'
    const dance = entry('55555555-5555-5555-8555-555555555555', 'A2', 'dance-music')
    const result = validateCatalogBundle([base, dance], manifest('A2', 2))
    expect(result).toEqual({ valid: true, errors: [] })
  })
})
