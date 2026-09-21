import { catalog } from '../content/catalog'
import { initialSchedule } from '../domain/scheduler'
import { defaultLanguagePairId, getLanguagePairConfig } from '../i18n/languagePairs'
import { db, type ReversolinguoDatabase } from '../storage/database'

export async function ensureCatalogSchedules(database: ReversolinguoDatabase = db, now = new Date(), pairId = defaultLanguagePairId): Promise<number> {
  const pair = getLanguagePairConfig(pairId)
  const existingKeys = new Set((await database.schedules.toCollection().primaryKeys()).map(String))
  const missing = catalog.flatMap((entry) => pair.directions.map((direction) => initialSchedule(entry.id, direction.id, now)))
    .filter((schedule) => !existingKeys.has(schedule.key))
  if (missing.length) await database.schedules.bulkPut(missing)
  return missing.length
}
