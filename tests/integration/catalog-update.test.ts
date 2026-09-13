import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { ensureCatalogSchedules } from '../../src/app/bootstrap'
import { initialSchedule } from '../../src/domain/scheduler'
import type { ReviewEvent, ScheduleState } from '../../src/domain/model'
import { ReversolinguoDatabase } from '../../src/storage/database'

class LegacyV2Database extends Dexie {
  constructor(name: string) {
    super(name)
    this.version(2).stores({ schedules: '&key, entryId, direction, state, dueAt', reviews: '&id, scheduleKey, reviewedAt, canceledAt', settings: '&id' })
  }
}

describe('catalog update migration', () => {
  const names: string[] = []
  afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name) })

  it('remaps legacy ids, preserves progress and adds only missing cards', async () => {
    const name = `catalog-update-${crypto.randomUUID()}`
    names.push(name)
    const legacy = new LegacyV2Database(name)
    const old = { ...initialSchedule('a1-mano', 'fr-es', new Date('2026-09-01T08:00:00Z')), state: 'REVIEW' as const, intervalDays: 21, dueAt: '2026-09-22T08:00:00.000Z' }
    await legacy.table<ScheduleState>('schedules').put(old)
    const event: ReviewEvent = {
      id: 'legacy-review-1', scheduleKey: old.key, entryId: old.entryId, direction: old.direction, rating: 2,
      reviewedAt: '2026-09-01T08:00:00.000Z', previousDueAt: '2026-08-30T08:00:00.000Z', nextDueAt: old.dueAt,
      appVersion: '0.1.0', catalogVersion: 'a1-pilot-1', schedulerVersion: 'srs-1', previousState: old
    }
    await legacy.table<ReviewEvent>('reviews').put(event)
    legacy.close()

    const current = new ReversolinguoDatabase(name)
    const newId = '69046998-47e6-5570-b469-5a5cc961a97e'
    const migrated = await current.schedules.get(`${newId}:fr-es`)
    expect(migrated?.intervalDays).toBe(21)
    expect(migrated?.state).toBe('REVIEW')
    expect(await current.schedules.get('a1-mano:fr-es')).toBeUndefined()
    const migratedEvent = await current.reviews.get('legacy-review-1')
    expect(migratedEvent?.entryId).toBe(newId)
    expect(migratedEvent?.previousState.entryId).toBe(newId)
    expect(migratedEvent?.catalogVersion).toBe('a1-pilot-1')

    expect(await ensureCatalogSchedules(current, new Date('2026-09-13T08:00:00Z'))).toBe(47)
    expect(await current.schedules.count()).toBe(48)
    expect((await current.schedules.get(`${newId}:fr-es`))?.intervalDays).toBe(21)
    expect(await ensureCatalogSchedules(current, new Date('2026-09-13T08:00:00Z'))).toBe(0)
    current.close()
  })
})
