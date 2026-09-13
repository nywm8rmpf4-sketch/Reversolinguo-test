import Dexie, { type EntityTable } from 'dexie'
import { legacyEntryIdMap } from '../content/legacyIds'
import type { ReviewEvent, ScheduleState } from '../domain/model'

export interface SettingsRecord {
  id: 'settings'
  onboarded: boolean
  direction: 'fr-es' | 'es-fr'
  dailyNew: number
  dailyGoalMinutes: number
  motionEnabled: boolean
  soundEnabled: boolean
  vibrationEnabled: boolean
}

export const defaultSettings: SettingsRecord = {
  id: 'settings', onboarded: false, direction: 'fr-es', dailyNew: 5, dailyGoalMinutes: 10,
  motionEnabled: true, soundEnabled: false, vibrationEnabled: false
}

function completeSettings(value?: Partial<SettingsRecord>): SettingsRecord {
  return { ...defaultSettings, ...value, id: 'settings' }
}

function migratedEntryId(entryId: string): string {
  return legacyEntryIdMap[entryId] ?? entryId
}

function migrateSchedule(schedule: ScheduleState): ScheduleState {
  const entryId = migratedEntryId(schedule.entryId)
  if (entryId === schedule.entryId) return schedule
  return { ...schedule, entryId, key: `${entryId}:${schedule.direction}` }
}

function migrateReview(review: ReviewEvent): ReviewEvent {
  const entryId = migratedEntryId(review.entryId)
  const previousState = migrateSchedule(review.previousState)
  const scheduleKey = `${entryId}:${review.direction}`
  if (entryId === review.entryId && scheduleKey === review.scheduleKey && previousState.key === review.previousState.key) return review
  return { ...review, entryId, scheduleKey, previousState }
}

export class ReversolinguoDatabase extends Dexie {
  schedules!: EntityTable<ScheduleState, 'key'>
  reviews!: EntityTable<ReviewEvent, 'id'>
  settings!: EntityTable<SettingsRecord, 'id'>

  constructor(name = 'reversolinguo') {
    super(name)
    this.version(1).stores({ schedules: '&key, entryId, direction, state, dueAt', reviews: '&id, scheduleKey, reviewedAt', settings: '&id' })
    this.version(2).stores({ schedules: '&key, entryId, direction, state, dueAt', reviews: '&id, scheduleKey, reviewedAt, canceledAt', settings: '&id' })
      .upgrade(async (transaction) => {
        const settings = await transaction.table('settings').get('settings') as Partial<SettingsRecord> | undefined
        if (settings) await transaction.table('settings').put(completeSettings(settings))
      })
    this.version(3).stores({ schedules: '&key, entryId, direction, state, dueAt', reviews: '&id, scheduleKey, reviewedAt, canceledAt', settings: '&id' })
      .upgrade(async (transaction) => {
        const schedules = transaction.table('schedules')
        for (const value of await schedules.toArray() as ScheduleState[]) {
          const migrated = migrateSchedule(value)
          if (migrated.key !== value.key) {
            await schedules.delete(value.key)
            await schedules.put(migrated)
          }
        }
        const reviews = transaction.table('reviews')
        for (const value of await reviews.toArray() as ReviewEvent[]) {
          const migrated = migrateReview(value)
          if (migrated !== value) await reviews.put(migrated)
        }
      })
    this.version(4).stores({ schedules: '&key, entryId, direction, state, dueAt', reviews: '&id, scheduleKey, reviewedAt, canceledAt', settings: '&id' })
      .upgrade(async (transaction) => {
        const settings = await transaction.table('settings').get('settings') as Partial<SettingsRecord> | undefined
        if (settings) await transaction.table('settings').put(completeSettings(settings))
      })
  }
}

export const db = new ReversolinguoDatabase()

export async function exportProgress(database = db): Promise<string> {
  return JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), schedules: await database.schedules.toArray(), reviews: await database.reviews.toArray(), settings: await database.settings.toArray() })
}

export async function importProgress(raw: string, database = db): Promise<void> {
  if (raw.length > 2_000_000) throw new Error('Fichier trop volumineux.')
  const data: unknown = JSON.parse(raw)
  const { validateProgressExport } = await import('../content/contracts')
  if (!validateProgressExport(data).valid) throw new Error('Format de sauvegarde invalide.')
  const validData = data as { schedules: ScheduleState[]; reviews: ReviewEvent[]; settings: Partial<SettingsRecord>[] }
  const normalizedSchedules = validData.schedules.map(migrateSchedule)
  const normalizedReviews = validData.reviews.map(migrateReview)
  const normalizedSettings = validData.settings.map((value) => completeSettings(value))
  await database.transaction('rw', database.schedules, database.reviews, database.settings, async () => {
    await Promise.all([database.schedules.clear(), database.reviews.clear(), database.settings.clear()])
    await database.schedules.bulkPut(normalizedSchedules)
    await database.reviews.bulkPut(normalizedReviews)
    await database.settings.bulkPut(normalizedSettings)
  })
}

export async function resetProgress(database = db): Promise<void> {
  await database.transaction('rw', database.schedules, database.reviews, database.settings, async () => {
    await Promise.all([database.schedules.clear(), database.reviews.clear(), database.settings.clear()])
  })
}
