import { webcrypto } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import canonicalEntries from '../../catalogs/fr-es/a1/catalog.json'
import tranchePartA from '../../catalogs/fr-es/a1/drafts/a1-tranche1-r1-part-a.json'
import tranchePartB from '../../catalogs/fr-es/a1/drafts/a1-tranche1-r1-part-b.json'
import tranchePartC from '../../catalogs/fr-es/a1/drafts/a1-tranche1-r1-part-c.json'
import sourceMap from '../../catalogs/fr-es/a1/drafts/a1-tranche1-r1-source-map.json'
import { validateLexicalEntry } from '../../src/content/contracts'
import { stableLexicalUuid, prepareLexicalBatch, type LexicalBatchEntryInput } from '../../src/content/lexicalBatch'
import { canonicalThemeIds } from '../../src/content/taxonomy'

const subtle = webcrypto.subtle as unknown as SubtleCrypto
const entries = [...tranchePartA, ...tranchePartB, ...tranchePartC]

function semanticKey(languageTag: string, lemma: string): string {
  return `${languageTag.normalize('NFC').trim().toLocaleLowerCase('es')}:${lemma.normalize('NFC').trim().toLocaleLowerCase('es')}`
}

describe('A1 tranche 1 non-runtime staging', () => {
  it('contains exactly the 33 accepted review rows and keeps the two regional arbitrations excluded', () => {
    expect(entries).toHaveLength(33)
    expect(sourceMap.included).toHaveLength(33)
    expect(sourceMap.excluded).toEqual([
      expect.objectContaining({ review_id: 'REV-A1-0034', lemma: 'el carné de identidad' }),
      expect.objectContaining({ review_id: 'REV-A1-0035', lemma: 'el carné de conducir' })
    ])

    const stagedIds = new Set(entries.map((entry) => entry.entry_id))
    expect(new Set(sourceMap.included.map((row) => row.entry_id))).toEqual(stagedIds)
    expect(sourceMap.included.map((row) => row.review_id)).toEqual(
      Array.from({ length: 33 }, (_, index) => `REV-A1-${String(index + 1).padStart(4, '0')}`)
    )
  })

  it('validates every draft against lexical-entry-v2 without invented human-review provenance', () => {
    for (const entry of entries) {
      const validation = validateLexicalEntry(entry)
      expect(validation.valid, `${entry.lemma}: ${JSON.stringify(validation.errors)}`).toBe(true)
      expect(entry).toMatchObject({ language_tag: 'es', cefr_level: 'A1', status: 'draft', version: 1 })
      expect(entry.provenance.license).toBe('CC BY 4.0')
      expect(entry.provenance).not.toHaveProperty('reviewed_by')
      expect(entry.provenance).not.toHaveProperty('reviewed_at')
      expect(entry.senses[0].example_source.trim()).not.toBe('')
      expect(entry.senses[0].example_target.trim()).not.toBe('')
      expect(entry.themes.every((theme) => canonicalThemeIds.has(theme as never))).toBe(true)
    }
  })

  it('does not encode slash-separated answer alternatives unless the source is an explicit paired lexical unit', () => {
    for (const entry of entries) {
      const sense = entry.senses[0] as { translations: string[]; note?: string }
      for (const translation of sense.translations) {
        if (!translation.includes(' / ')) continue
        expect(entry.lemma, `unexpected slash alternative in ${entry.lemma}: ${translation}`).toContain(' / ')
        expect(sense.note ?? '', `paired unit ${entry.lemma} must be explicitly documented`).toContain('paire lexicale')
      }
    }
  })

  it('uses the exact deterministic ADR-025 UUID for every new lemma', async () => {
    for (const entry of entries) {
      expect(entry.entry_id).toBe(await stableLexicalUuid('es', 'fr', entry.lemma, subtle))
    }
  })

  it('has no duplicate UUID or semantic key and no collision with the 60 canonical entries', () => {
    const ids = entries.map((entry) => entry.entry_id)
    const semanticKeys = entries.map((entry) => semanticKey(entry.language_tag, entry.lemma))
    expect(new Set(ids).size).toBe(entries.length)
    expect(new Set(semanticKeys).size).toBe(entries.length)

    const canonicalIds = new Set(canonicalEntries.map((entry) => entry.entry_id))
    const canonicalSemanticKeys = new Set(canonicalEntries.map((entry) => semanticKey(entry.language_tag, entry.lemma)))
    expect(entries.filter((entry) => canonicalIds.has(entry.entry_id))).toEqual([])
    expect(entries.filter((entry) => canonicalSemanticKeys.has(semanticKey(entry.language_tag, entry.lemma)))).toEqual([])
  })

  it('is exactly reproducible through the qualified ADR-025 materializer', async () => {
    const materializerInputs: LexicalBatchEntryInput[] = entries.map((entry) => ({
      lemma: entry.lemma,
      part_of_speech: entry.part_of_speech as LexicalBatchEntryInput['part_of_speech'],
      senses: entry.senses,
      cefr_rationale: entry.cefr_rationale,
      themes: entry.themes,
      variety: entry.variety,
      provenance: entry.provenance
    }))

    const result = await prepareLexicalBatch({
      batch_id: 'a1-tranche1-r3',
      source_language: 'es',
      target_language: 'fr',
      cefr_level: 'A1',
      provenance: {
        source: 'Reversolinguo editorial archive fr-es-a1-b2-school-progression-r1-2026-09-15; external references are used only for CEFR/domain framing',
        license: 'CC BY 4.0',
        authored_by: 'Reversolinguo project editorial draft'
      },
      entries: materializerInputs
    }, {
      subtle,
      existingEntries: canonicalEntries.map((entry) => ({ entry_id: entry.entry_id, language_tag: entry.language_tag, lemma: entry.lemma })),
      expectedLicense: 'CC BY 4.0'
    })

    expect(result.valid, result.errors.join('\n')).toBe(true)
    expect(result.entries).toEqual(entries)
  })
})
