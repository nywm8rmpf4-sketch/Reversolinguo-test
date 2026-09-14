import { resolveLearningPack, type LearningPack, type PackEntry } from '../content/packs'
import type { ReviewEvent, ScheduleState } from './model'

export interface PackProgressProjection {
  entries: PackEntry[]
  entryIds: ReadonlySet<string>
  schedules: ScheduleState[]
  reviews: ReviewEvent[]
}

/**
 * Projects canonical SRS data onto a LearningPack without creating or mutating
 * progress. Pack membership is a view over stable lexical entry ids.
 */
export function projectProgressToPack(
  packId: string,
  packs: LearningPack[],
  schedules: readonly ScheduleState[],
  reviews: readonly ReviewEvent[]
): PackProgressProjection {
  const entries = resolveLearningPack(packId, packs)
  const entryIds = new Set(entries.map((entry) => entry.entry_id))

  return {
    entries,
    entryIds,
    schedules: schedules.filter((schedule) => entryIds.has(schedule.entryId)),
    reviews: reviews.filter((review) => entryIds.has(review.entryId))
  }
}
