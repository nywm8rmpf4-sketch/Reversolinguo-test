import { catalog } from '../content/catalog'
import { initialSchedule } from '../domain/scheduler'
import { db, type ReversolinguoDatabase } from '../storage/database'

export async function ensureCatalogSchedules(database: ReversolinguoDatabase = db, now = new Date()): Promise<number> {
  const existingKeys = new Set((await database.schedules.toCollection().primaryKeys()).map(String))
  const missing = catalog.flatMap((entry) => (['fr-es', 'es-fr'] as const).map((direction) => initialSchedule(entry.id, direction, now)))
    .filter((schedule) => !existingKeys.has(schedule.key))
  if (missing.length) await database.schedules.bulkPut(missing)
  return missing.length
}
