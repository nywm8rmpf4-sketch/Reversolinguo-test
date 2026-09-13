import type { Direction, Rating, ScheduleState } from './model'
import { scheduleKey } from './model'

const DAY = 86_400_000

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
  const intervalDays = Math.min(365, Math.max(minimum, Math.round(base * factor)))
  return { ...current, state: 'REVIEW', learningStep: undefined, intervalDays, dueAt: new Date(now.getTime() + intervalDays * DAY).toISOString(), updatedAt: now.toISOString() }
}

export function orderSession(states: ScheduleState[], now: Date, newLimit = 5): ScheduleState[] {
  const due = states.filter((item) => item.state !== 'NEW' && item.state !== 'SUSPENDED' && new Date(item.dueAt) <= now)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
  const fresh = states.filter((item) => item.state === 'NEW').slice(0, newLimit)
  return [...due, ...fresh]
}
