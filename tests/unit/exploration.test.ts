import { describe, expect, it } from 'vitest'
import { hasActiveReviewToday, randomExplorationSession } from '../../src/domain/exploration'
import { initialSchedule } from '../../src/domain/scheduler'
import type { ReviewEvent, ScheduleState } from '../../src/domain/model'

function review(entryId: string, reviewedAt: Date, overrides: Partial<ReviewEvent> = {}): ReviewEvent {
  const previousState = initialSchedule(entryId, 'fr-es', reviewedAt)
  return {
    id: `review-${entryId}`,
    scheduleKey: previousState.key,
    entryId,
    direction: 'fr-es',
    rating: 2,
    reviewedAt: reviewedAt.toISOString(),
    previousDueAt: previousState.dueAt,
    nextDueAt: reviewedAt.toISOString(),
    appVersion: '0.1.0',
    catalogVersion: 'test',
    schedulerVersion: 'srs-1',
    previousState,
    ...overrides
  }
}

describe('exploration selection', () => {
  it('takes at most ten distinct non-suspended cards in shuffled order', () => {
    const now = new Date('2026-09-13T10:00:00')
    const states: ScheduleState[] = Array.from({ length: 12 }, (_, index) => initialSchedule(`entry-${index}`, 'fr-es', now))
    states[3] = { ...states[3], state: 'SUSPENDED' }
    const samples = [0.91, 0.12, 0.73, 0.34, 0.56, 0.22, 0.81, 0.44, 0.68, 0.15, 0.49]
    let cursor = 0

    const selected = randomExplorationSession(states, 10, () => samples[cursor++] ?? 0.5)

    expect(selected).toHaveLength(10)
    expect(new Set(selected.map((state) => state.key)).size).toBe(10)
    expect(selected.some((state) => state.state === 'SUSPENDED')).toBe(false)
    expect(selected.map((state) => state.key)).not.toEqual(states.filter((state) => state.state !== 'SUSPENDED').slice(0, 10).map((state) => state.key))
  })

  it('recognizes only a non-canceled review from today for an active entry and current direction', () => {
    const now = new Date(2026, 8, 13, 15, 0, 0)
    const active = new Set(['active'])
    const yesterday = new Date(2026, 8, 12, 23, 59, 0)

    expect(hasActiveReviewToday([review('active', yesterday)], 'fr-es', active, now)).toBe(false)
    expect(hasActiveReviewToday([review('other', now)], 'fr-es', active, now)).toBe(false)
    expect(hasActiveReviewToday([review('active', now, { direction: 'es-fr' })], 'fr-es', active, now)).toBe(false)
    expect(hasActiveReviewToday([review('active', now, { canceledAt: now.toISOString() })], 'fr-es', active, now)).toBe(false)
    expect(hasActiveReviewToday([review('active', now)], 'fr-es', active, now)).toBe(true)
  })
})
