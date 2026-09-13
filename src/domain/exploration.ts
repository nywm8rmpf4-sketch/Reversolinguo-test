import type { Direction, ReviewEvent, ScheduleState } from './model'

function localDayKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

export function hasActiveReviewToday(
  reviews: readonly ReviewEvent[],
  direction: Direction,
  activeEntryIds: ReadonlySet<string>,
  now: Date
): boolean {
  const today = localDayKey(now)
  return reviews.some((review) =>
    review.direction === direction &&
    !review.canceledAt &&
    activeEntryIds.has(review.entryId) &&
    localDayKey(new Date(review.reviewedAt)) === today
  )
}

export function randomExplorationSession(
  states: readonly ScheduleState[],
  limit = 10,
  random: () => number = Math.random
): ScheduleState[] {
  const pool = states.filter((state) => state.state !== 'SUSPENDED')
  const shuffled = [...pool]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const sample = Math.min(0.999999999999, Math.max(0, random()))
    const swapIndex = Math.floor(sample * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled.slice(0, Math.max(0, Math.min(limit, shuffled.length)))
}
