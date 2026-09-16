import { describe, expect, it } from 'vitest'
import {
  adultPackIdFor,
  defaultPathPreferences,
  normalizePathPreferences,
  schoolPackIdFor,
  summarizePath,
  themePackIdFor
} from '../../src/domain/pathSelection'

describe('PACK-7 R6 multi-selection', () => {
  it('preserves the historical default as International A1 with all 475 canonical entries', () => {
    const selected = summarizePath(defaultPathPreferences)
    expect(selected.audience).toBe('adult')
    expect(selected.selectedPacks.map((pack) => pack.cefr_target)).toEqual(['A1'])
    expect(selected.sourceCount).toBe(475)
    expect(selected.selectedNewCount).toBe(475)
    expect(new Set(selected.selectedNewEntries.map((entry) => entry.entry_id)).size).toBe(475)
  })

  it('combines several CEFR levels from their direct new vocabulary only', () => {
    const selected = summarizePath({
      audience: 'adult',
      selectedPackIds: [adultPackIdFor('A1'), adultPackIdFor('A2')],
      selectedThemeIds: [],
      reviewScope: 'all-due'
    })
    expect(selected.selectedPacks.map((pack) => pack.cefr_target)).toEqual(['A1', 'A2'])
    expect(selected.sourceCount).toBe(475)
    expect(selected.selectedNewCount).toBe(475)
  })

  it('combines several school classes without silently adding inherited vocabulary', () => {
    const selected = summarizePath({
      audience: 'school',
      selectedPackIds: [schoolPackIdFor('6e', 'LVA'), schoolPackIdFor('5e', 'LVA')],
      selectedThemeIds: [],
      reviewScope: 'all-due'
    })
    expect(selected.selectedPacks.map((pack) => pack.grade)).toEqual(['6e', '5e'])
    expect(selected.sourceCount).toBe(25)
    expect(new Set(selected.sourceEntries.map((entry) => entry.entry_id)).size).toBe(25)
  })

  it('supports several autonomous Voyage levels from direct level additions', () => {
    const selected = summarizePath({
      audience: 'theme',
      selectedPackIds: [themePackIdFor('A1'), themePackIdFor('B1')],
      selectedThemeIds: [],
      reviewScope: 'selection-only'
    })
    expect(selected.selectedPacks.map((pack) => pack.cefr_target)).toEqual(['A1', 'B1'])
    expect(selected.sourceCount).toBe(4)
    expect(selected.selectedNewCount).toBe(4)
  })

  it('treats zero themes as all themes and several themes as an OR before intersection with levels', () => {
    const base = { audience: 'adult' as const, selectedPackIds: [adultPackIdFor('A1')], reviewScope: 'all-due' as const }
    const all = summarizePath({ ...base, selectedThemeIds: [] })
    const school = summarizePath({ ...base, selectedThemeIds: ['ecole-etudes'] })
    const combined = summarizePath({ ...base, selectedThemeIds: ['ecole-etudes', 'alimentation'] })
    expect(all.selectedNewCount).toBe(475)
    expect(school.selectedNewCount).toBeGreaterThan(0)
    expect(school.selectedNewCount).toBeLessThan(475)
    expect(combined.selectedNewCount).toBeGreaterThanOrEqual(school.selectedNewCount)
    expect(new Set(combined.selectedNewEntries.map((entry) => entry.entry_id)).size).toBe(combined.selectedNewCount)
  })

  it('normalizes duplicates and migrates the unqualified PACK-7 primary-pack preference', () => {
    const school = schoolPackIdFor('6e', 'LVB')
    const normalized = normalizePathPreferences({
      primaryPackId: school,
      focusThemeIds: ['ecole-etudes', 'ecole-etudes'],
      adultScope: 'new-only'
    })
    expect(normalized.audience).toBe('school')
    expect(normalized.selectedPackIds).toEqual([school])
    expect(normalized.selectedThemeIds).toEqual(['ecole-etudes'])
    expect(normalized.reviewScope).toBe('all-due')
  })

  it('falls back safely to International A1 when persisted selection is unknown', () => {
    const normalized = normalizePathPreferences({
      audience: 'adult',
      selectedPackIds: ['obsolete-pack'],
      selectedThemeIds: ['voyage'],
      reviewScope: 'selection-only'
    })
    expect(normalized.selectedPackIds).toEqual(defaultPathPreferences.selectedPackIds)
    expect(normalized.selectedThemeIds).toEqual(['voyage'])
    expect(normalized.reviewScope).toBe('selection-only')
  })
})
