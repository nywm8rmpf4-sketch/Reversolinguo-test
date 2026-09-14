import { describe, expect, it } from 'vitest'
import { validateLearningPackGraph, type PackTrack } from '../../src/content/packs'
import { canonicalThemeIds } from '../../src/content/taxonomy'
import {
  axesForSchoolGrade2026_2027,
  program2025EffectiveFrom,
  programForSchoolGrade2026_2027,
  schoolPack2026_2027,
  schoolPacks2026_2027,
  targetForSchoolPack2026_2027,
  type SchoolGrade
} from '../../src/content/schoolReference'

const lvaLvbGrades: SchoolGrade[] = ['6e', '5e', '4e', '3e', 'seconde', 'premiere', 'terminale']
const lvcGrades: SchoolGrade[] = ['seconde', 'premiere', 'terminale']

function requirePack(grade: SchoolGrade, track: PackTrack) {
  const pack = schoolPack2026_2027(grade, track)
  expect(pack, `missing ${grade}/${track}`).toBeDefined()
  return pack!
}

describe('PACK-3 France school reference 2026-2027', () => {
  it('materializes exactly 17 structural manifests and validates the pack graph', () => {
    expect(schoolPacks2026_2027).toHaveLength(17)
    expect(schoolPacks2026_2027.filter((pack) => pack.track === 'LVA')).toHaveLength(7)
    expect(schoolPacks2026_2027.filter((pack) => pack.track === 'LVB')).toHaveLength(7)
    expect(schoolPacks2026_2027.filter((pack) => pack.track === 'LVC')).toHaveLength(3)
    expect(new Set(schoolPacks2026_2027.map((pack) => pack.pack_id)).size).toBe(17)

    expect(validateLearningPackGraph(schoolPacks2026_2027, undefined, canonicalThemeIds)).toEqual({
      valid: true,
      errors: []
    })
  })

  it('keeps PACK-3 structural only with no lexical assignment', () => {
    for (const pack of schoolPacks2026_2027) {
      expect(pack.school_year).toBe('2026-2027')
      expect(pack.audience).toBe('school')
      expect(pack.language_pair).toBe('fr-es')
      expect(pack.entries).toEqual([])
      expect(pack.status).toBe('draft')
      expect(pack.human_review).toBe('NOT_EXECUTED')
      expect(pack.sources.length).toBeGreaterThan(0)
    }
  })

  it('uses the officially applicable program per grade for school year 2026-2027', () => {
    expect(programForSchoolGrade2026_2027('6e').program_id).toBe('BO2025-MENE2504621A')
    expect(programForSchoolGrade2026_2027('5e').program_id).toBe('BO2025-MENE2504621A')
    expect(programForSchoolGrade2026_2027('4e').program_id).toBe('BO2020-MENE2018714A')
    expect(programForSchoolGrade2026_2027('3e').program_id).toBe('BO2020-MENE2018714A')
    expect(programForSchoolGrade2026_2027('seconde').program_id).toBe('BO2025-MENE2504621A')
    expect(programForSchoolGrade2026_2027('premiere').program_id).toBe('BO2025-MENE2504621A')
    expect(programForSchoolGrade2026_2027('terminale').program_id).toBe('BO2025-MENE2504621A')

    expect(program2025EffectiveFrom).toEqual({
      '6e': '2025-2026',
      '5e': '2026-2027',
      '4e': '2027-2028',
      '3e': '2028-2029',
      seconde: '2025-2026',
      premiere: '2026-2027',
      terminale: '2026-2027'
    })
  })

  it('builds deterministic cumulative chains independently for LVA, LVB and lycée LVC', () => {
    for (const track of ['LVA', 'LVB'] as const) {
      lvaLvbGrades.forEach((grade, index) => {
        const pack = requirePack(grade, track)
        const expectedParent = index === 0
          ? []
          : [`fr-es-school-2026-2027-${lvaLvbGrades[index - 1]}-${track.toLowerCase()}`]
        expect(pack.inherits_from).toEqual(expectedParent)
      })
    }

    lvcGrades.forEach((grade, index) => {
      const pack = requirePack(grade, 'LVC')
      const expectedParent = index === 0
        ? []
        : [`fr-es-school-2026-2027-${lvcGrades[index - 1]}-lvc`]
      expect(pack.inherits_from).toEqual(expectedParent)
    })

    expect(schoolPack2026_2027('6e', 'LVC')).toBeUndefined()
    expect(() => targetForSchoolPack2026_2027('4e', 'LVC')).toThrow(/not defined/)
  })

  it('preserves grade-end 2025 targets and cycle-end semantics for legacy 4e/3e', () => {
    expect(targetForSchoolPack2026_2027('6e', 'LVA')).toMatchObject({
      program_id: 'BO2025-MENE2504621A',
      scope: 'grade-end',
      official_label: 'A1+',
      operational_target: 'A1+'
    })
    expect(targetForSchoolPack2026_2027('5e', 'LVB')).toMatchObject({
      program_id: 'BO2025-MENE2504621A',
      scope: 'grade-end',
      official_label: 'A1+',
      operational_target: 'A1+'
    })
    expect(targetForSchoolPack2026_2027('4e', 'LVA')).toMatchObject({
      program_id: 'BO2020-MENE2018714A',
      scope: 'cycle-end',
      official_label: 'A2 minimum en fin de cycle',
      operational_target: 'A2'
    })
    expect(targetForSchoolPack2026_2027('3e', 'LVB')).toMatchObject({
      program_id: 'BO2020-MENE2018714A',
      scope: 'cycle-end',
      official_label: 'A2 dans au moins deux activités en fin de cycle',
      operational_target: 'A2'
    })
    expect(targetForSchoolPack2026_2027('seconde', 'LVA').operational_target).toBe('B1+')
    expect(targetForSchoolPack2026_2027('premiere', 'LVB').operational_target).toBe('B1')
    expect(targetForSchoolPack2026_2027('terminale', 'LVA').operational_target).toBe('B2')
  })

  it('retains the official terminale LVC A2+ / B1 label without overstating the operational target', () => {
    expect(targetForSchoolPack2026_2027('terminale', 'LVC')).toMatchObject({
      program_id: 'BO2025-MENE2504621A',
      scope: 'grade-end',
      official_label: 'A2+ / B1',
      operational_target: 'A2+'
    })
    expect(requirePack('terminale', 'LVC').cefr_target).toBe('A2+')
  })

  it('keeps official axis labels separate from editorial mappings to canonical themes', () => {
    expect(axesForSchoolGrade2026_2027('6e')).toHaveLength(5)
    expect(axesForSchoolGrade2026_2027('6e')[1].label_fr).toBe('Le quotidien : vivre, jouer, apprendre')
    expect(axesForSchoolGrade2026_2027('5e')).toHaveLength(6)
    expect(axesForSchoolGrade2026_2027('4e').map((axis) => axis.label_fr)).toEqual([
      'Langages',
      'École et société',
      'Voyages et migrations',
      'Rencontres avec d’autres cultures'
    ])
    expect(axesForSchoolGrade2026_2027('3e').map((axis) => axis.label_fr)).toEqual(
      axesForSchoolGrade2026_2027('4e').map((axis) => axis.label_fr)
    )
    expect(axesForSchoolGrade2026_2027('terminale').map((axis) => axis.label_fr)).toContain('Espace privé et espace public')

    for (const grade of lvaLvbGrades) {
      for (const axis of axesForSchoolGrade2026_2027(grade)) {
        expect(axis.mapping_status).toBe('editorial-alignment')
        expect(axis.canonical_theme_ids.length).toBeGreaterThan(0)
        for (const themeId of axis.canonical_theme_ids) expect(canonicalThemeIds.has(themeId)).toBe(true)
      }
    }
  })
})
