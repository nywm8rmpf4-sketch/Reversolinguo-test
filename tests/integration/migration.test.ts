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

describe('IndexedDB migrations and restart', () => {
  const names: string[] = []
  afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name) })

  it('migrates version 1 settings without losing schedules', async () => {
    const name = `migration-${crypto.randomUUID()}`; names.push(name)
    const legacy = new LegacyDatabase(name)
    await legacy.settings.put({ id: 'settings', onboarded: true, direction: 'fr-es' })
    await legacy.schedules.put(initialSchedule('a1-mano', 'fr-es', new Date('2026-09-13T08:00:00Z')))
    legacy.close()
    const current = new ReversolinguoDatabase(name)
    expect((await current.settings.get('settings'))?.dailyNew).toBe(5)
    expect(await current.schedules.count()).toBe(1)
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
