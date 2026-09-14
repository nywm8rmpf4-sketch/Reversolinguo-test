import { describe, expect, it } from 'vitest'
import { resolveLearningPack, type LearningPack, type PackEntry } from '../../src/content/packs'

const mano = '69046998-47e6-5570-b469-5a5cc961a97e'
const casa = '36e27c44-5b63-5024-bd41-81546b1e9191'
const libro = '6d9f4fb0-63d0-5e4b-b364-5308faba9ef4'

function entry(entry_id: string, priority: number, role: PackEntry['role'], theme = 'ecole-etudes'): PackEntry {
  return { entry_id, priority, role, theme }
}

function pack(pack_id: string, overrides: Partial<LearningPack> = {}): LearningPack {
  return {
    pack_id,
    pack_version: '2026.1',
    audience: 'adult',
    language_pair: 'fr-es',
    framework: 'CEFR',
    framework_version: 'Companion Volume 2020',
    cefr_target: 'A1',
    inherits_from: [],
    themes: ['ecole-etudes'],
    entries: [],
    sources: ['https://www.coe.int/en/web/common-european-framework-reference-languages'],
    status: 'draft',
    human_review: 'NOT_EXECUTED',
    ...overrides
  }
}

describe('PACK-2 inheritance precedence', () => {
  it('uses declared parent order deterministically when two parents contain the same entry', () => {
    const first = pack('first', { entries: [entry(mano, 40, 'core'), entry(casa, 20, 'core')] })
    const second = pack('second', { entries: [entry(mano, 30, 'extension'), entry(libro, 10, 'core')] })
    const child = pack('child', { inherits_from: ['first', 'second'] })

    expect(resolveLearningPack('child', [first, second, child])).toEqual([
      entry(libro, 10, 'core'),
      entry(casa, 20, 'core'),
      entry(mano, 30, 'extension')
    ])
  })

  it('lets a direct child relation override inherited role and priority without duplicating the entry', () => {
    const parent = pack('parent', { entries: [entry(mano, 40, 'core'), entry(casa, 20, 'core')] })
    const child = pack('child', {
      inherits_from: ['parent'],
      entries: [entry(mano, 5, 'reinforcement')]
    })

    const resolved = resolveLearningPack('child', [parent, child])
    expect(resolved).toEqual([entry(mano, 5, 'reinforcement'), entry(casa, 20, 'core')])
    expect(resolved.filter((item) => item.entry_id === mano)).toHaveLength(1)
  })

  it('preserves all four relation roles as pack metadata', () => {
    const roles: PackEntry['role'][] = ['core', 'reinforcement', 'extension', 'optional']
    const candidate = pack('roles', {
      entries: roles.map((role, index) => entry(`entry-${index}`, index + 1, role))
    })

    expect(resolveLearningPack('roles', [candidate]).map((item) => item.role)).toEqual(roles)
  })
})
