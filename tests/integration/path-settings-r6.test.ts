import { afterEach, describe, expect, it } from 'vitest'
import { ReversolinguoDatabase, defaultSettings, exportProgress, importProgress } from '../../src/storage/database'

describe('PACK-7 R6 selection settings persistence', () => {
  const names: string[] = []
  afterEach(async () => { for (const name of names.splice(0)) await new ReversolinguoDatabase(name).delete() })

  it('exports and restores multi-pack, multi-theme and review-scope preferences', async () => {
    const source = new ReversolinguoDatabase(`r6-source-${crypto.randomUUID()}`); names.push(source.name)
    const target = new ReversolinguoDatabase(`r6-target-${crypto.randomUUID()}`); names.push(target.name)
    await source.settings.put({
      ...defaultSettings,
      onboarded: true,
      pathAudience: 'adult',
      selectedPackIds: ['fr-es-adult-cefr-a1', 'fr-es-adult-cefr-a2'],
      selectedThemeIds: ['voyage', 'alimentation'],
      reviewScope: 'selection-only'
    })

    await importProgress(await exportProgress(source), target)
    expect(await target.settings.get('settings')).toMatchObject({
      pathAudience: 'adult',
      selectedPackIds: ['fr-es-adult-cefr-a1', 'fr-es-adult-cefr-a2'],
      selectedThemeIds: ['voyage', 'alimentation'],
      reviewScope: 'selection-only'
    })
  })

  it('migrates a certified-style historical export to International A1 with all due reminders', async () => {
    const target = new ReversolinguoDatabase(`r6-legacy-${crypto.randomUUID()}`); names.push(target.name)
    const raw = JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-09-15T06:00:00.000Z',
      schedules: [],
      reviews: [],
      settings: [{ id: 'settings', onboarded: true, direction: 'fr-es', dailyNew: 5 }]
    })
    await importProgress(raw, target)
    expect(await target.settings.get('settings')).toMatchObject({
      pathAudience: 'adult',
      selectedPackIds: ['fr-es-adult-cefr-a1'],
      selectedThemeIds: [],
      reviewScope: 'all-due'
    })
  })

  it('normalizes the unqualified PACK-7 primaryPackId experiment if encountered', async () => {
    const target = new ReversolinguoDatabase(`r6-pack7-legacy-${crypto.randomUUID()}`); names.push(target.name)
    const raw = JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-09-15T06:00:00.000Z',
      schedules: [],
      reviews: [],
      settings: [{
        id: 'settings', onboarded: true, direction: 'fr-es', dailyNew: 5,
        primaryPackId: 'fr-es-school-2026-2027-6e-lva', focusThemeIds: ['ecole-etudes'], adultScope: 'cumulative'
      }]
    })
    await importProgress(raw, target)
    expect(await target.settings.get('settings')).toMatchObject({
      pathAudience: 'school',
      selectedPackIds: ['fr-es-school-2026-2027-6e-lva'],
      selectedThemeIds: ['ecole-etudes'],
      reviewScope: 'all-due'
    })
  })
})
