import { afterEach, describe, expect, it } from 'vitest'
import { ReversolinguoDatabase, defaultSettings, exportProgress, importProgress } from '../../src/storage/database'
import { initialSchedule } from '../../src/domain/scheduler'

describe('local progress', () => {
  const names: string[] = []
  afterEach(async () => { for (const name of names.splice(0)) await new ReversolinguoDatabase(name).delete() })

  it('exports and restores a valid snapshot atomically', async () => {
    const source = new ReversolinguoDatabase(`source-${crypto.randomUUID()}`); names.push(source.name)
    await source.schedules.put(initialSchedule('card-1', 'fr-es', new Date('2026-09-13T08:00:00Z')))
    await source.settings.put({ ...defaultSettings, onboarded: true, direction: 'fr-es' })
    const raw = await exportProgress(source)
    const target = new ReversolinguoDatabase(`target-${crypto.randomUUID()}`); names.push(target.name)
    await importProgress(raw, target)
    expect(await target.schedules.count()).toBe(1)
    expect((await target.settings.get('settings'))?.onboarded).toBe(true)
  })

  it('normalizes a legacy valid export with new settings and catalog ids', async () => {
    const target = new ReversolinguoDatabase(`legacy-import-${crypto.randomUUID()}`); names.push(target.name)
    const raw = JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-09-13T08:00:00.000Z',
      schedules: [{
        key: 'a1-mano:fr-es', entryId: 'a1-mano', direction: 'fr-es', state: 'REVIEW', intervalDays: 21,
        dueAt: '2026-10-04T08:00:00.000Z', updatedAt: '2026-09-13T08:00:00.000Z', schedulerVersion: 'srs-1'
      }],
      reviews: [],
      settings: [{ id: 'settings', onboarded: true, direction: 'es-fr', dailyNew: 3 }]
    })
    await importProgress(raw, target)
    expect(await target.settings.get('settings')).toMatchObject({ direction: 'es-fr', dailyNew: 3, dailyGoalMinutes: 10, soundEnabled: false, vibrationEnabled: false })
    expect(await target.schedules.get('a1-mano:fr-es')).toBeUndefined()
    expect(await target.schedules.get('69046998-47e6-5570-b469-5a5cc961a97e:fr-es')).toMatchObject({ entryId: '69046998-47e6-5570-b469-5a5cc961a97e', intervalDays: 21 })
  })

  it('rejects an invalid snapshot without erasing existing data', async () => {
    const database = new ReversolinguoDatabase(`invalid-${crypto.randomUUID()}`); names.push(database.name)
    await database.settings.put({ ...defaultSettings, onboarded: true, direction: 'es-fr' })
    await expect(importProgress('{"schemaVersion":2}', database)).rejects.toThrow('Format de sauvegarde invalide')
    expect((await database.settings.get('settings'))?.direction).toBe('es-fr')
  })
})
