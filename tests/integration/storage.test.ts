import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReversolinguoDatabase, defaultSettings, exportProgress, importProgress, resetProgress } from '../../src/storage/database'
import { initialSchedule } from '../../src/domain/scheduler'
import type { ReviewEvent } from '../../src/domain/model'

function validSnapshot(entryId = 'card-1') {
  const schedule = initialSchedule(entryId, 'fr-es', new Date('2026-09-13T08:00:00Z'))
  return {
    raw: JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-09-13T08:00:00.000Z',
      schedules: [schedule],
      reviews: [],
      settings: [{ ...defaultSettings, onboarded: true }]
    }),
    schedule
  }
}

describe('local progress', () => {
  const names: string[] = []
  afterEach(async () => { for (const name of names.splice(0)) await new ReversolinguoDatabase(name).delete() })

  it('exports and restores a valid snapshot atomically', async () => {
    const source = new ReversolinguoDatabase(`source-${crypto.randomUUID()}`); names.push(source.name)
    await source.schedules.put(initialSchedule('card-1', 'fr-es', new Date('2026-09-13T08:00:00Z')))
    await source.settings.put({ ...defaultSettings, onboarded: true, direction: 'fr-es', soundMode: 'on' })
    const raw = await exportProgress(source)
    const exported = JSON.parse(raw) as { settings: Array<Record<string, unknown>> }
    expect(exported.settings[0]).toMatchObject({ soundMode: 'on' })
    expect(exported.settings[0]).not.toHaveProperty('soundEnabled')
    const target = new ReversolinguoDatabase(`target-${crypto.randomUUID()}`); names.push(target.name)
    await importProgress(raw, target)
    expect(await target.schedules.count()).toBe(1)
    expect(await target.settings.get('settings')).toMatchObject({ onboarded: true, soundMode: 'on' })
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
    expect(await target.settings.get('settings')).toMatchObject({ direction: 'es-fr', dailyNew: 3, dailyGoalMinutes: 10, soundMode: 'off', vibrationEnabled: false })
    expect(await target.schedules.get('a1-mano:fr-es')).toBeUndefined()
    expect(await target.schedules.get('69046998-47e6-5570-b469-5a5cc961a97e:fr-es')).toMatchObject({ entryId: '69046998-47e6-5570-b469-5a5cc961a97e', intervalDays: 21 })
  })

  it('maps the historical soundEnabled preference without changing user intent', async () => {
    const enabled = new ReversolinguoDatabase(`legacy-sound-on-${crypto.randomUUID()}`); names.push(enabled.name)
    const disabled = new ReversolinguoDatabase(`legacy-sound-off-${crypto.randomUUID()}`); names.push(disabled.name)
    const base = { schemaVersion: 1, exportedAt: '2026-09-13T08:00:00.000Z', schedules: [], reviews: [] }
    await importProgress(JSON.stringify({ ...base, settings: [{ id: 'settings', onboarded: true, direction: 'fr-es', dailyNew: 5, soundEnabled: true }] }), enabled)
    await importProgress(JSON.stringify({ ...base, settings: [{ id: 'settings', onboarded: true, direction: 'fr-es', dailyNew: 5, soundEnabled: false }] }), disabled)
    expect((await enabled.settings.get('settings'))?.soundMode).toBe('on')
    expect((await disabled.settings.get('settings'))?.soundMode).toBe('off')
  })

  it('rejects an invalid snapshot without erasing existing data', async () => {
    const database = new ReversolinguoDatabase(`invalid-${crypto.randomUUID()}`); names.push(database.name)
    await database.settings.put({ ...defaultSettings, onboarded: true, direction: 'es-fr' })
    await expect(importProgress('{"schemaVersion":2}', database)).rejects.toThrow('Format de sauvegarde invalide')
    expect((await database.settings.get('settings'))?.direction).toBe('es-fr')
  })

  it('rejects an import larger than two million bytes before parsing and preserves data', async () => {
    const database = new ReversolinguoDatabase(`oversize-${crypto.randomUUID()}`); names.push(database.name)
    await database.settings.put({ ...defaultSettings, onboarded: true, direction: 'es-fr' })
    const oversized = `{"padding":"${'é'.repeat(1_000_001)}"}`
    await expect(importProgress(oversized, database)).rejects.toThrow('Fichier trop volumineux')
    expect((await database.settings.get('settings'))?.direction).toBe('es-fr')
  })

  it.each([
    '<img src=x onerror=alert(1)>',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>'
  ])('rejects active imported content before any write: %s', async (entryId) => {
    const database = new ReversolinguoDatabase(`active-${crypto.randomUUID()}`); names.push(database.name)
    await database.settings.put({ ...defaultSettings, onboarded: true, direction: 'es-fr' })
    const { raw } = validSnapshot(entryId)
    await expect(importProgress(raw, database)).rejects.toThrow('Contenu actif interdit')
    expect((await database.settings.get('settings'))?.direction).toBe('es-fr')
    expect(await database.schedules.count()).toBe(0)
  })

  it('rolls back all tables if restoration fails after transaction start', async () => {
    const database = new ReversolinguoDatabase(`rollback-${crypto.randomUUID()}`); names.push(database.name)
    const oldSchedule = initialSchedule('old-card', 'fr-es', new Date('2026-09-13T08:00:00Z'))
    await database.schedules.put(oldSchedule)
    await database.settings.put({ ...defaultSettings, onboarded: true, direction: 'es-fr' })
    const { raw, schedule: newSchedule } = validSnapshot('new-card')
    const failure = vi.spyOn(database.reviews, 'bulkPut').mockRejectedValueOnce(new Error('injected failure'))
    await expect(importProgress(raw, database)).rejects.toThrow('injected failure')
    failure.mockRestore()
    expect(await database.schedules.get(oldSchedule.key)).toEqual(oldSchedule)
    expect(await database.schedules.get(newSchedule.key)).toBeUndefined()
    expect((await database.settings.get('settings'))?.direction).toBe('es-fr')
  })

  it('clears schedules, reviews and settings in one reset', async () => {
    const database = new ReversolinguoDatabase(`reset-${crypto.randomUUID()}`); names.push(database.name)
    const schedule = initialSchedule('card-1', 'fr-es', new Date('2026-09-13T08:00:00Z'))
    const review: ReviewEvent = {
      id: 'review-1', scheduleKey: schedule.key, entryId: schedule.entryId, direction: schedule.direction, rating: 2,
      reviewedAt: '2026-09-13T08:01:00.000Z', previousDueAt: schedule.dueAt, nextDueAt: '2026-09-14T08:01:00.000Z',
      appVersion: '0.1.0', catalogVersion: '2026.09-pilot2', schedulerVersion: 'srs-1', previousState: schedule
    }
    await database.schedules.put(schedule)
    await database.reviews.put(review)
    await database.settings.put({ ...defaultSettings, onboarded: true })
    await resetProgress(database)
    expect(await Promise.all([database.schedules.count(), database.reviews.count(), database.settings.count()])).toEqual([0, 0, 0])
  })
})
