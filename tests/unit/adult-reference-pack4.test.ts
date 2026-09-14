import { describe, expect, it } from 'vitest'
import { validateLearningPackGraph, type LearningPack, type PackEntry } from '../../src/content/packs'
import {
  adultInitialDeliveryLevels,
  adultLevelDescriptors,
  adultPackForLevel,
  adultPackId,
  adultPacksInitial,
  adultSupportedLevels,
  selectAdultPackEntries,
  validateAdultReference
} from '../../src/content/adultReference'

const entryA = '69046998-47e6-5570-b469-5a5cc961a97e'
const entryB = '36e27c44-5b63-5024-bd41-81546b1e9191'
const entryC = '6d9f4fb0-63d0-5e4b-b364-5308faba9ef4'

function relation(entry_id: string, priority: number): PackEntry {
  return { entry_id, role: 'core', priority, theme: 'identite' }
}

function fixtureAdultPacks(): LearningPack[] {
  return adultPacksInitial.map((pack) => {
    if (pack.cefr_target === 'A1') return { ...pack, themes: ['identite'], entries: [relation(entryA, 20)] }
    if (pack.cefr_target === 'A2') return { ...pack, themes: ['identite'], entries: [relation(entryB, 10)] }
    if (pack.cefr_target === 'B1') return { ...pack, themes: ['identite'], entries: [relation(entryC, 5)] }
    return { ...pack, themes: ['identite'], entries: [] }
  })
}

describe('PACK-4 adult CEFR reference', () => {
  it('materializes exactly A1 to B2 while keeping C1/C2 architecture-ready', () => {
    expect(adultSupportedLevels).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])
    expect(adultInitialDeliveryLevels).toEqual(['A1', 'A2', 'B1', 'B2'])
    expect(adultPacksInitial).toHaveLength(4)
    expect(adultPacksInitial.map((pack) => pack.cefr_target)).toEqual(['A1', 'A2', 'B1', 'B2'])
    expect(adultPackForLevel('C1')).toBeUndefined()
    expect(adultPackForLevel('C2')).toBeUndefined()
    expect(adultLevelDescriptors.filter((descriptor) => descriptor.delivery_status === 'architecture-ready').map((descriptor) => descriptor.level)).toEqual(['C1', 'C2'])
  })

  it('keeps adult manifests structural and free of school-specific fields', () => {
    for (const pack of adultPacksInitial) {
      expect(pack.audience).toBe('adult')
      expect(pack.framework).toBe('CEFR')
      expect(pack.framework_version).toBe('Companion-Volume-2020')
      expect(pack.language_pair).toBe('fr-es')
      expect(pack.entries).toEqual([])
      expect(pack.school_year).toBeUndefined()
      expect(pack.grade).toBeUndefined()
      expect(pack.track).toBeUndefined()
      expect(pack.status).toBe('draft')
      expect(pack.human_review).toBe('NOT_EXECUTED')
      expect(pack.sources.length).toBeGreaterThan(0)
    }

    expect(validateAdultReference()).toEqual({ valid: true, errors: [] })
    expect(validateLearningPackGraph(adultPacksInitial)).toEqual({ valid: true, errors: [] })
  })

  it('builds the deterministic cumulative A1 -> A2 -> B1 -> B2 chain', () => {
    expect(adultPackForLevel('A1')?.inherits_from).toEqual([])
    expect(adultPackForLevel('A2')?.inherits_from).toEqual([adultPackId('A1')])
    expect(adultPackForLevel('B1')?.inherits_from).toEqual([adultPackId('A2')])
    expect(adultPackForLevel('B2')?.inherits_from).toEqual([adultPackId('B1')])
  })

  it('distinguishes cumulative and new-only selection without cloning UUIDs', () => {
    const packs = fixtureAdultPacks()

    expect(selectAdultPackEntries('B1', 'new-only', packs).map((entry) => entry.entry_id)).toEqual([entryC])
    expect(selectAdultPackEntries('B1', 'cumulative', packs).map((entry) => entry.entry_id)).toEqual([entryC, entryB, entryA])

    const allIds = selectAdultPackEntries('B1', 'cumulative', packs).map((entry) => entry.entry_id)
    expect(new Set(allIds).size).toBe(allIds.length)
    expect(allIds).toEqual(expect.arrayContaining([entryA, entryB, entryC]))
  })

  it('keeps new-only deterministic by priority then canonical entry id', () => {
    const packs = fixtureAdultPacks().map((pack) =>
      pack.cefr_target === 'A2'
        ? { ...pack, entries: [relation(entryA, 20), relation(entryC, 10), relation(entryB, 10)] }
        : pack
    )

    expect(selectAdultPackEntries('A2', 'new-only', packs).map((entry) => entry.entry_id)).toEqual([
      entryB,
      entryC,
      entryA
    ])
  })

  it('does not materialize unsupported delivery levels as a hidden fallback', () => {
    expect(() => selectAdultPackEntries('C1', 'cumulative')).toThrow(/not materialized/)
    expect(() => selectAdultPackEntries('C2', 'new-only')).toThrow(/not materialized/)
  })

  it('rejects school contamination in the adult reference validator', () => {
    const school: LearningPack = {
      pack_id: 'fr-es-school-fixture',
      pack_version: 'test',
      audience: 'school',
      language_pair: 'fr-es',
      framework: 'France-LVE',
      framework_version: 'test',
      school_year: '2026-2027',
      grade: '6e',
      track: 'LVA',
      cefr_target: 'A1',
      inherits_from: [],
      themes: [],
      entries: [],
      sources: ['test'],
      status: 'draft',
      human_review: 'NOT_EXECUTED'
    }

    const contaminated = [...adultPacksInitial, school]
    expect(validateAdultReference(contaminated).valid).toBe(false)
    expect(validateAdultReference(contaminated).errors).toContain('non-adult-pack:fr-es-school-fixture')
  })

  it('keeps CEFR summaries explicitly descriptive rather than lexical catalog claims', () => {
    expect(adultLevelDescriptors).toHaveLength(6)
    for (const descriptor of adultLevelDescriptors) {
      expect(descriptor.communicative_orientation_fr.length).toBeGreaterThan(20)
      expect(descriptor.lexical_orientation_fr.length).toBeGreaterThan(20)
      expect(descriptor.source_keys).toContain('companion2020')
      expect(descriptor.source_keys).toContain('globalScale')
    }
  })
})
