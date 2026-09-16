import { webcrypto } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import canonicalEntries from '../../catalogs/fr-es/a1/catalog.json'
import {
  editorialStatusNeedsArbitration,
  editorialTranslations,
  prepareEditorialCorpus,
  reconcileEditorialRows,
  type EditorialEnrichment,
  type EditorialLexicalRow
} from '../../src/content/editorialIntake'
import { stableLexicalUuid } from '../../src/content/lexicalBatch'

const subtle = webcrypto.subtle as unknown as SubtleCrypto
const canonicalIdentities = canonicalEntries.map((entry) => ({
  entry_id: entry.entry_id,
  language_tag: entry.language_tag,
  lemma: entry.lemma
}))

function row(overrides: Partial<EditorialLexicalRow> = {}): EditorialLexicalRow {
  return {
    review_id: 'REV-A1-TEST-0001',
    spanish: 'el término de prueba',
    french: 'le terme de test',
    type: 'nom',
    theme: 'identite',
    subtheme: 'fixture éditoriale',
    relation: 'BASE A1',
    rationale: 'Fixture technique non canonique pour tester l’adaptateur éditorial',
    cefr_level: 'A1',
    school_lva: '6e',
    school_lvb: '6e',
    reversolinguo_sublevel: 'A1.2',
    intra_cefr_index: 71,
    confidence_lva: 'élevée',
    confidence_lvb: 'élevée',
    review_status: 'CANDIDAT A1 — À REVOIR',
    source_url: 'https://example.invalid/framing-only',
    ...overrides
  }
}

function enrichment(reviewId = 'REV-A1-TEST-0001', overrides: Partial<EditorialEnrichment> = {}): EditorialEnrichment {
  return {
    review_id: reviewId,
    example_source: 'Este es el término de prueba.',
    example_target: 'Ceci est le terme de test.',
    variety: 'pan-hispanic-common',
    ...overrides
  }
}

describe('A1-B2 editorial intake adapter', () => {
  it('reconciles a PACK-6B lemma to its existing canonical UUID instead of regenerating it', () => {
    const source = row({
      review_id: 'REV-A1-0228',
      spanish: 'la nariz',
      french: 'le nez',
      theme: 'corps-sante'
    })

    const result = reconcileEditorialRows([source], canonicalIdentities)
    const canonical = canonicalEntries.find((entry) => entry.lemma === 'la nariz')

    expect(result).toMatchObject({ valid: true, errors: [], new_rows: [] })
    expect(canonical).toBeDefined()
    expect(result.existing_matches).toEqual([{
      review_id: 'REV-A1-0228',
      entry_id: canonical!.entry_id,
      lemma: 'la nariz'
    }])
  })

  it('keeps temporary REV identifiers out of lexical identity and generates the ADR-025 UUID', async () => {
    const source = row()
    const result = await prepareEditorialCorpus(
      [source],
      [enrichment()],
      canonicalIdentities,
      { subtle, archiveId: 'fr-es-a1-b2-school-progression-r1-2026-09-15' }
    )
    const expectedUuid = await stableLexicalUuid('es', 'fr', 'el término de prueba', subtle)

    expect(result.valid).toBe(true)
    expect(result.ready_for_semantic_review).toBe(true)
    expect(result.entries_by_level.A1).toHaveLength(1)
    expect(result.entries_by_level.A1[0]).toMatchObject({
      entry_id: expectedUuid,
      lemma: 'el término de prueba',
      part_of_speech: 'noun',
      cefr_level: 'A1',
      themes: ['identite'],
      status: 'draft',
      version: 1
    })
    expect(result.entries_by_level.A1[0].entry_id).not.toContain('REV-')
    expect(result.entries_by_level.A1[0].provenance).not.toHaveProperty('reviewed_by')
    expect(result.entries_by_level.A1[0].provenance).not.toHaveProperty('reviewed_at')
  })

  it('allows ordinary À REVOIR rows to become non-runtime drafts when required fields are supplied', async () => {
    const result = await prepareEditorialCorpus(
      [row()],
      [enrichment()],
      canonicalIdentities,
      { subtle }
    )

    expect(result.valid).toBe(true)
    expect(result.entries_by_level.A1[0].status).toBe('draft')
  })

  it('is fail-closed while a row still needs arbitration or modernization', async () => {
    expect(editorialStatusNeedsArbitration('CANDIDAT A2 — ARBITRAGE RÉGIONAL')).toBe(true)
    expect(editorialStatusNeedsArbitration('CANDIDAT A2 — MODERNISER')).toBe(true)
    expect(editorialStatusNeedsArbitration('CANDIDAT A1 — À REVOIR')).toBe(false)

    const result = await prepareEditorialCorpus(
      [row({ review_status: 'CANDIDAT A1 — ARBITRAGE RÉGIONAL' })],
      [enrichment()],
      canonicalIdentities,
      { subtle }
    )

    expect(result.valid).toBe(false)
    expect(result.ready_for_semantic_review).toBe(false)
    expect(Object.values(result.entries_by_level).flat()).toEqual([])
    expect(result.errors.some((error) => error.includes('unresolved-editorial-status'))).toBe(true)
  })

  it('is fail-closed when mandatory bilingual examples are absent', async () => {
    const result = await prepareEditorialCorpus([row()], [], canonicalIdentities, { subtle })

    expect(result.valid).toBe(false)
    expect(result.entries_by_level.A1).toEqual([])
    expect(result.errors).toContain('review:REV-A1-TEST-0001:missing-enrichment')
  })

  it('rejects unsupported editorial types and unknown canonical themes before lexical materialization', async () => {
    const result = await prepareEditorialCorpus(
      [row({ type: 'type éditorial inconnu', theme: 'theme-inconnu' })],
      [enrichment()],
      canonicalIdentities,
      { subtle }
    )

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('review:REV-A1-TEST-0001:unsupported-type:type éditorial inconnu')
    expect(result.errors).toContain('review:REV-A1-TEST-0001:unknown-theme:theme-inconnu')
  })

  it('detects duplicates across CEFR levels before any partial output can be produced', async () => {
    const result = await prepareEditorialCorpus(
      [
        row({ review_id: 'REV-A1-TEST-0001', cefr_level: 'A1' }),
        row({ review_id: 'REV-A2-TEST-0001', cefr_level: 'A2' })
      ],
      [enrichment('REV-A1-TEST-0001'), enrichment('REV-A2-TEST-0001')],
      canonicalIdentities,
      { subtle }
    )

    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes('duplicate-editorial-semantic:es:el término de prueba'))).toBe(true)
    expect(Object.values(result.entries_by_level).flat()).toEqual([])
  })

  it('splits only explicit semicolon alternatives and preserves slash nuances', () => {
    expect(editorialTranslations('le prénom / le nom ; l’appellation')).toEqual([
      'le prénom / le nom',
      'l’appellation'
    ])
  })
})
