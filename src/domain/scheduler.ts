import type { Direction, Rating, ReviewEvent, ScheduleState } from './model'
import { scheduleKey } from './model'

const DAY = 86_400_000
const DUE_PRIORITY: Record<'RELEARNING' | 'LEARNING' | 'REVIEW', number> = { RELEARNING: 0, LEARNING: 1, REVIEW: 2 }

function localDayKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

function jitterPercent(key: string): number {
  let hash = 2_166_136_261
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0) % 11 - 5
}

function alternateThemes(items: ScheduleState[], themeByEntryId?: ReadonlyMap<string, string>): ScheduleState[] {
  if (!themeByEntryId || items.length < 2) return items
  const remaining = [...items]
  const ordered: ScheduleState[] = []
  let previousTheme: string | undefined
  while (remaining.length) {
    const differentTheme = previousTheme === undefined ? 0 : remaining.findIndex((item) => themeByEntryId.get(item.entryId) !== previousTheme)
    const index = differentTheme >= 0 ? differentTheme : 0
    const [next] = remaining.splice(index, 1)
    ordered.push(next)
    previousTheme = themeByEntryId.get(next.entryId)
  }
  return ordered
}

export function initialSchedule(entryId: string, direction: Direction, now: Date): ScheduleState {
  return {
    key: scheduleKey(entryId, direction), entryId, direction, state: 'NEW', intervalDays: 0,
    dueAt: now.toISOString(), updatedAt: now.toISOString(), schedulerVersion: 'srs-1'
  }
}

export function reviewSchedule(current: ScheduleState, rating: Rating, now: Date): ScheduleState {
  if (rating === 0) {
    return { ...current, state: 'RELEARNING', learningStep: 0, intervalDays: 0, dueAt: new Date(now.getTime() + 10 * 60_000).toISOString(), updatedAt: now.toISOString() }
  }
  if (current.state === 'NEW') {
    return { ...current, state: 'LEARNING', learningStep: 0, intervalDays: 0, dueAt: new Date(now.getTime() + 10 * 60_000).toISOString(), updatedAt: now.toISOString() }
  }
  if (current.state === 'LEARNING' || current.state === 'RELEARNING') {
    if ((current.learningStep ?? 0) === 0) {
      return { ...current, learningStep: 1, intervalDays: 1, dueAt: new Date(now.getTime() + DAY).toISOString(), updatedAt: now.toISOString() }
    }
    return { ...current, state: 'REVIEW', learningStep: undefined, intervalDays: 3, dueAt: new Date(now.getTime() + 3 * DAY).toISOString(), updatedAt: now.toISOString() }
  }
  const base = current.intervalDays || 1
  const factor = rating === 1 ? 1.2 : rating === 2 ? 2.3 : 3.5
  const minimum = rating === 3 ? base + 2 : rating === 2 ? base + 1 : 1
  const rawInterval = Math.max(minimum, Math.round(base * factor))
  const variedInterval = Math.round(rawInterval * (1 + jitterPercent(current.key) / 100))
  const intervalDays = Math.min(365, Math.max(minimum, variedInterval))
  return { ...current, state: 'REVIEW', learningStep: undefined, intervalDays, dueAt: new Date(now.getTime() + intervalDays * DAY).toISOString(), updatedAt: now.toISOString() }
}

export function remainingDailyNew(reviews: ReviewEvent[], direction: Direction, now: Date, dailyLimit: number): number {
  const today = localDayKey(now)
  const introduced = new Set(reviews.filter((review) =>
    review.direction === direction && !review.canceledAt && review.previousState.state === 'NEW' && localDayKey(new Date(review.reviewedAt)) === today
  ).map((review) => review.scheduleKey)).size
  return Math.max(0, dailyLimit - introduced)
}

export function orderSession(states: ScheduleState[], now: Date, newLimit = 5, themeByEntryId?: ReadonlyMap<string, string>): ScheduleState[] {
  const due = states.filter((item): item is ScheduleState & { state: 'RELEARNING' | 'LEARNING' | 'REVIEW' } =>
    item.state !== 'NEW' && item.state !== 'SUSPENDED' && new Date(item.dueAt) <= now
  ).sort((a, b) => DUE_PRIORITY[a.state] - DUE_PRIORITY[b.state] || new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())

  const groupedDue: ScheduleState[] = []
  for (const state of ['RELEARNING', 'LEARNING', 'REVIEW'] as const) {
    groupedDue.push(...alternateThemes(due.filter((item) => item.state === state), themeByEntryId))
  }
  const fresh = alternateThemes(states.filter((item) => item.state === 'NEW'), themeByEntryId).slice(0, newLimit)
  return [...groupedDue, ...fresh]
}
