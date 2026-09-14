import { describe, expect, it } from 'vitest'
import { validateLearningPack } from '../../src/content/contracts'
import {
  PackResolutionError,
  resolveLearningPack,
  validateLearningPackGraph,
  type LearningPack,
  type PackEntry
} from '../../src/content/packs'

const mano = '69046998-47e6-5570-b469-5a5cc961a97e'
const casa = '36e27c44-5b63-5024-bd41-81546b1e9191'
const libro = '6d9f4fb0-63d0-5e4b-b364-5308faba9ef4'

function entry(entry_id: string, priority: number, role: PackEntry['role'] = 'core', theme = 'école'): PackEntry {
  return { entry_id, priority, role, theme }
}

function pack(overrides: Partial<LearningPack> & Pick<LearningPack, 'pack_id'>): LearningPack {
  const { pack_id, ...rest } = overrides
  return {
    pack_id,
    pack_version: '2026.1',
    audience: 'adult',
    language_pair: 'fr-es',
    framework: 'CEFR',
    framework_version: 'Companion Volume 2020',
    cefr_target: 'A1',
    inherits_from: [],
    themes: ['école'],
    entries: [],
    sources: ['https://www.coe.int/en/web/common-european-framework-reference-languages'],
    status: 'draft',
    human_review: 'NOT_EXECUTED',
    ...rest
  }
}

describe('LearningPack contracts', () => {
  it('accepts adult plus-level targets and requires school metadata for school packs', () => {
    const adult = pack({ pack_id: 'adult-a2-plus', cefr_target: 'A2+' })
    expect(validateLearningPack(adult)).toEqual({ valid: true, errors: [] })

    const incompleteSchool = pack({ pack_id: 'fr-es-5e-lva-2026', audience: 'school', cefr_target: 'A2' })
    expect(validateLearningPack(incompleteSchool).valid).toBe(false)

    const school = pack({
      pack_id: 'fr-es-5e-lva-2026',
      audience: 'school',
      framework: 'Education nationale FR',
      framework_version: 'BO-2025-22',
      school_year: '2026-2027',
      grade: '5e',
      track: 'LVA',
      cefr_target: 'A2'
    })
    expect(validateLearningPack(school)).toEqual({ valid: true, errors: [] })
  })
})

describe('LearningPack resolver', () => {
  it('resolves cumulative school inheritance, deduplicates entries and lets the closest pack override relation metadata', () => {
    const sixieme = pack({
      pack_id: 'school-6e-lva',
      audience: 'school', framework: 'Education nationale FR', framework_version: 'BO-2025-22',
      school_year: '2026-2027', grade: '6e', track: 'LVA', cefr_target: 'A1+',
      entries: [entry(mano, 20, 'core'), entry(casa, 30, 'core')]
    })
    const cinquieme = pack({
      pack_id: 'school-5e-lva',
      audience: 'school', framework: 'Education nationale FR', framework_version: 'BO-2025-22',
      school_year: '2026-2027', grade: '5e', track: 'LVA', cefr_target: 'A2',
      inherits_from: ['school-6e-lva'],
      entries: [entry(libro, 10, 'core'), entry(casa, 5, 'reinforcement')]
    })

    expect(resolveLearningPack('school-5e-lva', [sixieme, cinquieme])).toEqual([
      entry(casa, 5, 'reinforcement'),
      entry(libro, 10, 'core'),
      entry(mano, 20, 'core')
    ])
  })

  it('detects inheritance cycles', () => {
    const left = pack({ pack_id: 'left-pack', inherits_from: ['right-pack'] })
    const right = pack({ pack_id: 'right-pack', inherits_from: ['left-pack'] })

    expect(() => resolveLearningPack('left-pack', [left, right])).toThrow(PackResolutionError)
    expect(validateLearningPackGraph([left, right]).errors).toContain('inheritance-cycle:left-pack')
  })

  it('flags missing parents, unknown lexical entries and undeclared entry themes', () => {
    const candidate = pack({
      pack_id: 'candidate-pack',
      inherits_from: ['missing-pack'],
      entries: [entry(mano, 1, 'core', 'voyage')]
    })
    const result = validateLearningPackGraph([candidate], new Set([casa]))

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('missing-parent:candidate-pack:missing-pack')
    expect(result.errors).toContain(`unknown-entry:candidate-pack:${mano}`)
    expect(result.errors).toContain(`entry-theme-not-declared:candidate-pack:${mano}:voyage`)
  })

  it('rejects duplicate pack ids before resolution', () => {
    const first = pack({ pack_id: 'same-pack' })
    const second = pack({ pack_id: 'same-pack' })
    const result = validateLearningPackGraph([first, second])
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('duplicate-pack-id:same-pack')
  })
})
