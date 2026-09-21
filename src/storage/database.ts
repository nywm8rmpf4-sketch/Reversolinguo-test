import Dexie, { type EntityTable } from 'dexie'
import { legacyEntryIdMap } from '../content/legacyIds'
import { validateProgressExportRuntime } from '../content/runtimeProgressValidation'
import type { Direction, ReviewEvent, ScheduleState } from '../domain/model'
import { defaultSoundMode, soundModeFromPersisted, type SoundMode } from '../audio/model'
import { defaultLanguagePairId, pairForDirection } from '../i18n/languagePairs'

export interface SettingsRecord {
  id: 'settings'
  onboarded: boolean
  direction: Direction
  activePairId: string
  dailyNew: number
  dailyGoalMinutes: number
  motionEnabled: boolean
  soundMode: SoundMode
  vibrationEnabled: boolean
  pathAudience: 'school' | 'adult' | 'theme'
  selectedPackIds: string[]
  selectedThemeIds: string[]
  reviewScope: 'all-due' | 'selection-only'
}

type PersistedSettingsInput = Partial<SettingsRecord> & {
  soundEnabled?: boolean
  primaryPackId?: string
  focusThemeIds?: string[]
  adultScope?: 'cumulative' | 'new-only'
}

export const defaultSettings: SettingsRecord = {
  id: 'settings', onboarded: false, direction: 'fr-es', activePairId: defaultLanguagePairId, dailyNew: 5, dailyGoalMinutes: 10,
  motionEnabled: true, soundMode: defaultSoundMode, vibrationEnabled: false,
  pathAudience: 'adult', selectedPackIds: ['fr-es-adult-cefr-a1'], selectedThemeIds: [], reviewScope: 'all-due'
}

const maxImportBytes = 2_000_000
const forbiddenActiveContent = /(?:<[^>]+>|javascript\s*:|data\s*:\s*text\/html)/iu

function audienceFromPackId(packId?: string): SettingsRecord['pathAudience'] | undefined {
  if (!packId) return undefined
  if (packId.includes('-school-')) return 'school'
  if (packId.includes('-theme-')) return 'theme'
  if (packId.includes('-adult-')) return 'adult'
  return undefined
}

function completeSettings(value?: PersistedSettingsInput): SettingsRecord {
  const {
    soundEnabled,
    primaryPackId,
    focusThemeIds,
    ...current
  } = value ?? {}

  const legacyAudience = audienceFromPackId(primaryPackId)
  const requestedAudience = current.pathAudience === 'school' || current.pathAudience === 'theme' || current.pathAudience === 'adult'
    ? current.pathAudience
    : legacyAudience ?? defaultSettings.pathAudience

  const selectedPackIds = Array.isArray(current.selectedPackIds)
    ? current.selectedPackIds.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : typeof primaryPackId === 'string' && primaryPackId.trim() ? [primaryPackId] : [...defaultSettings.selectedPackIds]

  const selectedThemeIds = Array.isArray(current.selectedThemeIds)
    ? current.selectedThemeIds.filter((item): item is string => typeof item === 'string')
    : Array.isArray(focusThemeIds) ? focusThemeIds.filter((item): item is string => typeof item === 'string') : []

  const reviewScope = current.reviewScope === 'selection-only' ? 'selection-only' : 'all-due'
  const activePairId = typeof current.activePairId === 'string' && current.activePairId.trim()
    ? current.activePairId
    : (() => { try { return pairForDirection(current.direction ?? defaultSettings.direction).id } catch { return defaultLanguagePairId } })()

  return {
    ...defaultSettings,
    ...current,
    pathAudience: requestedAudience,
    selectedPackIds: selectedPackIds.length ? [...new Set(selectedPackIds)] : [...defaultSettings.selectedPackIds],
    selectedThemeIds: [...new Set(selectedThemeIds)],
    reviewScope,
    activePairId,
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
    this.version(6).stores(stores)
      .upgrade(async (transaction) => {
        const settings = await transaction.table('settings').get('settings') as PersistedSettingsInput | undefined
        if (settings) await transaction.table('settings').put(completeSettings(settings))
      })
    this.version(7).stores(stores)
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
  if (!validateProgressExportRuntime(data).valid) throw new Error('Format de sauvegarde invalide.')
  const validData = data as { schedules: ScheduleState[]; reviews: ReviewEvent[]; settings: PersistedSettingsInput[] }
  const normalizedSchedules = validData.schedules.map(migrateSchedule)
  const normalizedReviews = validData.reviews.map(migrateReview)
  const normalizedSettings = validData.settings.map((item) => completeSettings(item))
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
