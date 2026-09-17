import { describe, expect, it } from 'vitest'
import {
  buildCatalogProjectionFromEditorialRows,
  materializeSchoolAssignments,
  validateCatalogProjection,
  type CatalogProjectionDocument
} from '../../src/content/catalogProjection'
import type { EditorialLexicalRow } from '../../src/content/editorialIntake'

const firstId = '11111111-1111-5111-8111-111111111111'
const secondId = '22222222-2222-5222-8222-222222222222'
const ids = new Set([firstId, secondId])
const themes = new Set(['identite', 'ecole-etudes'])

function row(reviewId: string, overrides: Partial<EditorialLexicalRow> = {}): EditorialLexicalRow {
  return {
    review_id: reviewId,
    spanish: `fixture ${reviewId}`,
    french: `fixture ${reviewId}`,
    type: 'nom',
    theme: 'identite',
    rationale: 'fixture projection data-only',
    cefr_level: 'A1',
    school_lva: '6e',
    school_lvb: '5e',
    review_status: 'VALIDÉ',
    ...overrides
  }
}

function build(rows: EditorialLexicalRow[], mapping = new Map([['REV-1', firstId], ['REV-2', secondId]])) {
  return buildCatalogProjectionFromEditorialRows(rows, mapping, {
    catalogId: 'fr-es-a1',
    catalogVersion: 'fixture-v1',
    source: { artifact: 'fixture.csv', sha256: 'a'.repeat(64) },
    allowedThemes: themes
  })
}

describe('catalog data-only projection contract', () => {
  it('copies exact LVA/LVB classifications without deriving a grade', () => {
    const result = build([
      row('REV-1', { school_lva: '6e', school_lvb: '4e' }),
      row('REV-2', { theme: 'ecole-etudes', school_lva: '5e', school_lvb: undefined })
    ])

    expect(result).toMatchObject({ valid: true, errors: [] })
    expect(result.projection?.school_source_assignments).toEqual([
      { review_id: 'REV-1', entry_id: firstId, track: 'LVA', grade: '6e', theme: 'identite' },
      { review_id: 'REV-1', entry_id: firstId, track: 'LVB', grade: '4e', theme: 'identite' },
      { review_id: 'REV-2', entry_id: secondId, track: 'LVA', grade: '5e', theme: 'ecole-etudes' }
    ])
    expect(result.projection?.source_counts.school).toEqual({ 'LVA:5e': 1, 'LVA:6e': 1, 'LVB:4e': 1 })
  })

  it('keeps source accounting distinct from canonical runtime cardinality after reconciliation', () => {
    const mapping = new Map([['REV-1', firstId], ['REV-2', firstId]])
    const result = build([
      row('REV-1', { school_lvb: undefined }),
      row('REV-2', { school_lvb: undefined })
    ], mapping)

    expect(result.valid).toBe(true)
    expect(result.projection?.source_counts.school).toEqual({ 'LVA:6e': 2 })
    expect(materializeSchoolAssignments(result.projection!)).toEqual([{
      entry_id: firstId,
      track: 'LVA',
      grade: '6e',
      theme: 'identite',
      source_review_ids: ['REV-1', 'REV-2']
    }])
  })

  it('fails closed instead of guessing an invalid or missing school classification', () => {
    const invalidGrade = build([row('REV-1', { school_lva: 'A1' })])
    expect(invalidGrade.valid).toBe(false)
    expect(invalidGrade.errors).toContain('row:0:school-invalid-grade:LVA:A1')

    const unresolved = build([row('REV-3')])
    expect(unresolved.valid).toBe(false)
    expect(unresolved.errors).toContain('row:0:school-entry-id-unresolved:REV-3')
  })

  it('rejects unknown UUIDs, themes and inconsistent declared source counts', () => {
    const document: CatalogProjectionDocument = {
      schema_version: '1.0',
      catalog_id: 'fr-es-a1',
      catalog_version: 'fixture-v1',
      source: { artifact: 'fixture.csv' },
      school_source_assignments: [{
        review_id: 'REV-1',
        entry_id: '33333333-3333-5333-8333-333333333333',
        track: 'LVA',
        grade: '6e',
        theme: 'identite'
      }],
      theme_path_assignments: [{
        entry_id: firstId,
        path_id: 'voyage',
        cefr_level: 'A1',
        theme: 'theme-inconnu' as never
      }],
      source_counts: { school: { 'LVA:6e': 99 }, theme_paths: { 'voyage:A1': 1 } }
    }

    const validation = validateCatalogProjection(document, ids, themes)
    expect(validation.valid).toBe(false)
    expect(validation.errors).toContain('school-unknown-entry:33333333-3333-5333-8333-333333333333')
    expect(validation.errors).toContain('theme-path-unknown-theme:theme-inconnu')
    expect(validation.errors).toContain('school-source-count-mismatch')
  })

  it('rejects conflicting themes for one materialized school relation', () => {
    const document: CatalogProjectionDocument = {
      schema_version: '1.0',
      catalog_id: 'fr-es-a1',
      catalog_version: 'fixture-v1',
      source: { artifact: 'fixture.csv' },
      school_source_assignments: [
        { review_id: 'REV-1', entry_id: firstId, track: 'LVA', grade: '6e', theme: 'identite' },
        { review_id: 'REV-2', entry_id: firstId, track: 'LVA', grade: '6e', theme: 'ecole-etudes' }
      ],
      theme_path_assignments: [],
      source_counts: { school: { 'LVA:6e': 2 }, theme_paths: {} }
    }

    const validation = validateCatalogProjection(document, ids, themes)
    expect(validation.valid).toBe(false)
    expect(validation.errors).toContain(`school-conflicting-theme:LVA:6e:${firstId}`)
  })
})
