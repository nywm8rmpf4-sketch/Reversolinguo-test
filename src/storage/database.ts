import Dexie, { type EntityTable } from 'dexie'
import { legacyEntryIdMap } from '../content/legacyIds'
import type { Direction, ReviewEvent, ScheduleState } from '../domain/model'
import { defaultSoundMode, soundModeFromPersisted, type SoundMode } from '../audio/model'

export interface SettingsRecord {
  id: 'settings'
  onboarded: boolean
  direction: Direction
  dailyNew: number
  dailyGoalMinutes: number
  motionEnabled: boolean
  soundMode: SoundMode
  vibrationEnabled: boolean
}

type PersistedSettingsInput = Partial<SettingsRecord> & { soundEnabled?: boolean }

export const defaultSettings: SettingsRecord = {
  id: 'settings', onboarded: false, direction: 'fr-es', dailyNew: 5, dailyGoalMinutes: 10,
  motionEnabled: true, soundMode: defaultSoundMode, vibrationEnabled: false
}

const maxImportBytes = 2_000_000
const forbiddenActiveContent = /(?:<[^>]+>|javascript\s*:|data\s*:\s*text\/html)/iu

function completeSettings(value?: PersistedSettingsInput): SettingsRecord {
  const { soundEnabled, ...current } = value ?? {}
  return {
    ...defaultSettings,
    ...current,
    soundMode: soundModeFromPersisted(current.soundMode, soundEnabled),
    id: 'settings'
  }
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

function containsForbiddenActiveContent(value: unknown): boolean {
  if (typeof value === 'string') return forbiddenActiveContent.test(value)
  if (Array.isArray(value)) return value.some(containsForbiddenActiveContent)
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, item]) => forbiddenActiveContent.test(key) || containsForbiddenActiveContent(item))
  }
  return false
}

export class ReversolinguoDatabase extends Dexie {
  schedules!: EntityTable<ScheduleState, 'key'>
  reviews!: EntityTable<ReviewEvent, 'id'>
  settings!: EntityTable<SettingsRecord, 'id'>

  constructor(name = 'reversolinguo') {
    super(name)
    const stores = { schedules: '&key, entryId, direction, state, dueAt', reviews: '&id, scheduleKey, reviewedAt, canceledAt', settings: '&id' }
    this.version(1).stores({ schedules: '&key, entryId, direction, state, dueAt', reviews: '&id, scheduleKey, reviewedAt', settings: '&id' })
    this.version(2).stores(stores)
      .upgrade(async (transaction) => {
        const settings = await transaction.table('settings').get('settings') as PersistedSettingsInput | undefined
        if (settings) await transaction.table('settings').put(completeSettings(settings))
      })
    this.version(3).stores(stores)
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
    this.version(4).stores(stores)
      .upgrade(async (transaction) => {
        const settings = await transaction.table('settings').get('settings') as PersistedSettingsInput | undefined
        if (settings) await transaction.table('settings').put(completeSettings(settings))
      })
    this.version(5).stores(stores)
      .upgrade(async (transaction) => {
        const settings = await transaction.table('settings').get('settings') as PersistedSettingsInput | undefined
        if (settings) await transaction.table('settings').put(completeSettings(settings))
      })
  }
}

export const db = new ReversolinguoDatabase()

export async function exportProgress(database = db): Promise<string> {
  return JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), schedules: await database.schedules.toArray(), reviews: await database.reviews.toArray(), settings: await database.settings.toArray() })
}

export async function importProgress(raw: string, database = db): Promise<void> {
  if (new TextEncoder().encode(raw).byteLength > maxImportBytes) throw new Error('Fichier trop volumineux.')
  const data: unknown = JSON.parse(raw)
  if (containsForbiddenActiveContent(data)) throw new Error('Contenu actif interdit dans la sauvegarde.')
  const { validateProgressExport } = await import('../content/contracts')
  if (!validateProgressExport(data).valid) throw new Error('Format de sauvegarde invalide.')
  const validData = data as { schedules: ScheduleState[]; reviews: ReviewEvent[]; settings: PersistedSettingsInput[] }
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
