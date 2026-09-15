import { webcrypto } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import canonicalEntries from '../../catalogs/fr-es/a1/catalog.json'
import {
  prepareLexicalBatch,
  stableLexicalUuid,
  type LexicalBatchEntryInput,
  type LexicalBatchInput
} from '../../src/content/lexicalBatch'

const subtle = webcrypto.subtle as unknown as SubtleCrypto

function entry(lemma: string, overrides: Partial<LexicalBatchEntryInput> = {}): LexicalBatchEntryInput {
  return {
    lemma,
    part_of_speech: 'noun',
    gender: 'masculine',
    article: 'el',
    senses: [{
      sense_id: 's1',
      translations: [`traduction ${lemma}`],
      example_source: `Ejemplo ${lemma}.`,
      example_target: `Exemple ${lemma}.`
    }],
    cefr_rationale: 'Candidat éditorial synthétique pour test du pipeline.',
    themes: ['description'],
    variety: 'test-only',
    ...overrides
  }
}

function batch(entries: LexicalBatchEntryInput[]): LexicalBatchInput {
  return {
    batch_id: 'test-pack6c-r1',
    source_language: 'es',
    target_language: 'fr',
    cefr_level: 'A1',
    provenance: {
      source: 'Fixture synthétique PACK-6C non publiable',
      license: 'CC BY 4.0',
      authored_by: 'Reversolinguo test fixture'
    },
    entries
  }
}

describe('PACK-6C lexical batch pipeline', () => {
  it('generates a standard deterministic UUID v5 from conservative normalized identity', async () => {
    const composed = await stableLexicalUuid('es', 'fr', 'el árbol', subtle)
    const decomposed = await stableLexicalUuid(' ES ', ' FR ', '  el a\u0301rbol  ', subtle)

    expect(composed).toBe('b03b684f-bc99-5cbb-b554-6ad204e25642')
    expect(decomposed).toBe(composed)
    expect(composed[14]).toBe('5')
    expect(['8', '9', 'a', 'b']).toContain(composed[19])
  })

  it('materializes a valid batch as draft entries with inherited and overridden provenance', async () => {
    const input = batch([
      entry('  el árbol  ', {
        senses: [{
          sense_id: ' s1 ',
          translations: ['  l’arbre  '],
          example_source: '  El árbol es alto.  ',
          example_target: '  L’arbre est grand.  '
        }]
      }),
      entry('la plaza', {
        gender: 'feminine',
        article: 'la',
        provenance: {
          source: 'Source éditoriale spécifique',
          authored_by: 'Auteur spécifique'
        }
      })
    ])

    const result = await prepareLexicalBatch(input, {
      subtle,
      expectedLicense: 'CC BY 4.0'
    })

    expect(result).toMatchObject({ valid: true, errors: [], batch_id: 'test-pack6c-r1' })
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0]).toMatchObject({
      lemma: 'el árbol',
      status: 'draft',
      version: 1,
      language_tag: 'es',
      cefr_level: 'A1',
      provenance: {
        source: 'Fixture synthétique PACK-6C non publiable',
        license: 'CC BY 4.0',
        authored_by: 'Reversolinguo test fixture'
      }
    })
    expect(result.entries[0].senses[0]).toEqual({
      sense_id: 's1',
      translations: ['l’arbre'],
      example_source: 'El árbol es alto.',
      example_target: 'L’arbre est grand.'
    })
    expect(result.entries[1].provenance).toEqual({
      source: 'Source éditoriale spécifique',
      license: 'CC BY 4.0',
      authored_by: 'Auteur spécifique'
    })
    expect(result.entries.every((candidate) => !('reviewed_by' in candidate.provenance))).toBe(true)
    expect(result.entries.every((candidate) => !('reviewed_at' in candidate.provenance))).toBe(true)
  })

  it('is fail-closed on an internal semantic duplicate', async () => {
    const result = await prepareLexicalBatch(batch([
      entry('la plaza', { gender: 'feminine', article: 'la' }),
      entry('  LA PLAZA  ', { gender: 'feminine', article: 'la' })
    ]), { subtle })

    expect(result.valid).toBe(false)
    expect(result.entries).toEqual([])
    expect(result.errors.some((error) => error.includes('duplicate-batch-semantic:es:la plaza'))).toBe(true)
    expect(result.errors.some((error) => error.includes('duplicate-batch-id:'))).toBe(true)
  })

  it('rejects semantic or UUID collisions with the active canonical catalog', async () => {
    const existing = canonicalEntries.map((candidate) => ({
      entry_id: candidate.entry_id,
      language_tag: candidate.language_tag,
      lemma: candidate.lemma
    }))
    const result = await prepareLexicalBatch(batch([
      entry('la mano', { gender: 'feminine', article: 'la', themes: ['corps-sante'] })
    ]), { subtle, existingEntries: existing })

    expect(result.valid).toBe(false)
    expect(result.entries).toEqual([])
    expect(result.errors.some((error) => error.includes('existing-semantic:es:la mano'))).toBe(true)
  })

  it('rejects unknown themes, incompatible licences and a supplied unstable identifier', async () => {
    const input = batch([
      entry('entrada artificial', {
        entry_id: '00000000-0000-5000-8000-000000000000',
        themes: ['not-a-theme'],
        provenance: { license: 'UNEXPECTED' }
      })
    ])

    const result = await prepareLexicalBatch(input, {
      subtle,
      expectedLicense: 'CC BY 4.0'
    })

    expect(result.valid).toBe(false)
    expect(result.entries).toEqual([])
    expect(result.errors).toContain('entry:0:provided-id-mismatch')
    expect(result.errors).toContain('entry:0:unknown-theme:not-a-theme')
    expect(result.errors).toContain('entry:0:unexpected-license:UNEXPECTED')
  })

  it('rejects an empty batch instead of producing a partially usable result', async () => {
    const result = await prepareLexicalBatch(batch([]), { subtle })
    expect(result).toEqual({
      valid: false,
      errors: ['empty-batch'],
      entries: [],
      batch_id: 'test-pack6c-r1'
    })
  })
})
