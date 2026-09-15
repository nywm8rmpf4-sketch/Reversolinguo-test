import { describe, expect, it } from 'vitest'
import {
  adultPackIdFor,
  defaultPathPreferences,
  normalizePathPreferences,
  schoolPackIdFor,
  summarizePath,
  themePackIdFor
} from '../../src/domain/pathSelection'

function summary(primaryPackId: string, adultScope: 'cumulative' | 'new-only' = 'cumulative') {
  return summarizePath({ primaryPackId, adultScope, focusThemeIds: [] })
}

describe('PACK-7 path selection', () => {
  it('preserves the historical default experience as Adult A1 with all 60 canonical entries', () => {
    const selected = summarizePath(defaultPathPreferences)
    expect(selected.audience).toBe('adult')
    expect(selected.pack.cefr_target).toBe('A1')
    expect(selected.effectiveCount).toBe(60)
    expect(new Set(selected.effectiveEntries.map((entry) => entry.entry_id)).size).toBe(60)
  })

  it('supports cumulative and new-only adult views without creating lexical identities', () => {
    const cumulative = summary(adultPackIdFor('A2'), 'cumulative')
    const newOnly = summary(adultPackIdFor('A2'), 'new-only')
    expect(cumulative.effectiveCount).toBe(60)
    expect(cumulative.directCount).toBe(0)
    expect(cumulative.inheritedCount).toBe(60)
    expect(newOnly.effectiveCount).toBe(0)
    expect(newOnly.directCount).toBe(0)
  })

  it('resolves school inheritance and keeps LVA/LVB separate', () => {
    const lva6 = summary(schoolPackIdFor('6e', 'LVA'))
    const lvb6 = summary(schoolPackIdFor('6e', 'LVB'))
    const lva5 = summary(schoolPackIdFor('5e', 'LVA'))
    expect(lva6.effectiveCount).toBe(25)
    expect(lvb6.effectiveCount).toBe(25)
    expect(lva5.directCount).toBe(0)
    expect(lva5.inheritedCount).toBe(25)
    expect(lva5.effectiveCount).toBe(25)
    expect(lva6.pack.pack_id).not.toBe(lvb6.pack.pack_id)
  })

  it('resolves the autonomous Voyage path cumulatively', () => {
    const a1 = summary(themePackIdFor('A1'))
    const b1 = summary(themePackIdFor('B1'))
    expect(a1.effectiveCount).toBe(4)
    expect(a1.directCount).toBe(4)
    expect(b1.effectiveCount).toBe(4)
    expect(b1.inheritedCount).toBe(4)
    expect(b1.availableFocusThemes).toEqual([])
  })

  it('retains only focus themes that exist in the selected effective pack', () => {
    const school = schoolPackIdFor('6e', 'LVA')
    const normalized = normalizePathPreferences({
      primaryPackId: school,
      adultScope: 'cumulative',
      focusThemeIds: ['ecole-etudes', 'alimentation', 'ecole-etudes']
    })
    expect(normalized.focusThemeIds).toEqual(['ecole-etudes'])
  })

  it('falls back safely to Adult A1 for an obsolete or unknown persisted pack id', () => {
    const normalized = normalizePathPreferences({ primaryPackId: 'obsolete-pack', adultScope: 'new-only', focusThemeIds: ['voyage'] })
    expect(normalized.primaryPackId).toBe(defaultPathPreferences.primaryPackId)
    expect(normalized.adultScope).toBe('new-only')
    expect(normalized.focusThemeIds).toEqual(['voyage'])
  })
})
