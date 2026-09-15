import type { PackEntry } from '../content/packs'
import type { ReviewEvent, ScheduleState } from './model'
import type { ReviewScope } from './pathSelection'
import { orderSession } from './scheduler'

function selectedEntryIdSet(selectedEntries: readonly PackEntry[]): Set<string> {
  return new Set(selectedEntries.map((entry) => entry.entry_id))
}

/**
 * R6 session projection. NEW cards always come only from the current
 * class/level × theme selection. Learned cards remain globally eligible in
 * all-due mode and are narrowed to the same selection in selection-only mode.
 * No ScheduleState is mutated.
 */
export function statesForSelection(
  states: readonly ScheduleState[],
  selectedEntries: readonly PackEntry[],
  catalogEntryIds: ReadonlySet<string>,
  reviewScope: ReviewScope
): ScheduleState[] {
  const selected = selectedEntryIdSet(selectedEntries)
  return states.filter((state) => {
    if (!catalogEntryIds.has(state.entryId)) return false
    if (state.state === 'NEW') return selected.has(state.entryId)
    return reviewScope === 'selection-only' ? selected.has(state.entryId) : true
  })
}

export function reviewsForSelection(
  reviews: readonly ReviewEvent[],
  selectedEntries: readonly PackEntry[],
  catalogEntryIds: ReadonlySet<string>,
  reviewScope: ReviewScope
): ReviewEvent[] {
  const selected = selectedEntryIdSet(selectedEntries)
  return reviews.filter((review) =>
    catalogEntryIds.has(review.entryId) && (reviewScope === 'all-due' || selected.has(review.entryId))
  )
}

export function entryIdsForReviewScope(
  selectedEntries: readonly PackEntry[],
  catalogEntryIds: ReadonlySet<string>,
  reviewScope: ReviewScope
): Set<string> {
  if (reviewScope === 'all-due') return new Set(catalogEntryIds)
  return selectedEntryIdSet(selectedEntries)
}

export function orderSelectedSession(
  states: readonly ScheduleState[],
  selectedEntries: readonly PackEntry[],
  catalogEntryIds: ReadonlySet<string>,
  reviewScope: ReviewScope,
  now: Date,
  newLimit: number,
  themeByEntryId?: ReadonlyMap<string, string>
): ScheduleState[] {
  return orderSession(
    statesForSelection(states, selectedEntries, catalogEntryIds, reviewScope),
    now,
    newLimit,
    themeByEntryId
  )
}
