import Dexie, { type Table } from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { ReversolinguoDatabase } from '../../src/storage/database'
import { initialSchedule } from '../../src/domain/scheduler'

class LegacyDatabase extends Dexie {
  settings!: Table<{ id: string; onboarded: boolean; direction: string }, string>
  schedules!: Table<ReturnType<typeof initialSchedule>, string>
  constructor(name: string) {
    super(name)
    this.version(1).stores({ schedules: '&key, entryId, direction, state, dueAt', reviews: '&id, scheduleKey, reviewedAt', settings: '&id' })
  }
}

class LegacySoundDatabase extends Dexie {
  settings!: Table<{ id: string; onboarded: boolean; direction: string; dailyNew: number; dailyGoalMinutes: number; motionEnabled: boolean; soundEnabled: boolean; vibrationEnabled: boolean }, string>
  constructor(name: string) {
    super(name)
    const stores = { schedules: '&key, entryId, direction, state, dueAt', reviews: '&id, scheduleKey, reviewedAt, canceledAt', settings: '&id' }
    this.version(1).stores({ schedules: '&key, entryId, direction, state, dueAt', reviews: '&id, scheduleKey, reviewedAt', settings: '&id' })
    this.version(2).stores(stores)
    this.version(3).stores(stores)
    this.version(4).stores(stores)
  }
}

describe('IndexedDB migrations and restart', () => {
  const names: string[] = []
  afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name) })

  it('migrates version 1 settings without losing schedules and keeps historical silence', async () => {
    const name = `migration-${crypto.randomUUID()}`; names.push(name)
    const legacy = new LegacyDatabase(name)
    await legacy.settings.put({ id: 'settings', onboarded: true, direction: 'fr-es' })
    await legacy.schedules.put(initialSchedule('a1-mano', 'fr-es', new Date('2026-09-13T08:00:00Z')))
    legacy.close()
    const current = new ReversolinguoDatabase(name)
    expect(await current.settings.get('settings')).toMatchObject({ dailyNew: 5, soundMode: 'off' })
    expect(await current.schedules.count()).toBe(1)
    current.close()
  })

  it.each([
    [true, 'on'],
    [false, 'off']
  ] as const)('migrates version 4 soundEnabled=%s to soundMode=%s', async (soundEnabled, expectedMode) => {
    const name = `sound-migration-${soundEnabled}-${crypto.randomUUID()}`; names.push(name)
    const legacy = new LegacySoundDatabase(name)
    await legacy.settings.put({ id: 'settings', onboarded: true, direction: 'fr-es', dailyNew: 5, dailyGoalMinutes: 10, motionEnabled: true, soundEnabled, vibrationEnabled: false })
    legacy.close()
    const current = new ReversolinguoDatabase(name)
    expect((await current.settings.get('settings'))?.soundMode).toBe(expectedMode)
    expect(await current.settings.get('settings')).not.toHaveProperty('soundEnabled')
    current.close()
  })

  it('reopens at the last committed schedule state', async () => {
    const name = `restart-${crypto.randomUUID()}`; names.push(name)
    const first = new ReversolinguoDatabase(name)
    const schedule = { ...initialSchedule('a1-casa', 'es-fr', new Date()), state: 'REVIEW' as const, intervalDays: 3 }
    await first.schedules.put(schedule); first.close()
    const reopened = new ReversolinguoDatabase(name)
    expect(await reopened.schedules.get(schedule.key)).toEqual(schedule)
    reopened.close()
  })
})
