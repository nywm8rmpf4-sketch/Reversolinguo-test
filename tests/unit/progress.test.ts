import { describe, expect, it } from 'vitest'
import type { ReviewEvent, ScheduleState } from '../../src/domain/model'
import { summarizeProgress } from '../../src/domain/progress'
import { initialSchedule } from '../../src/domain/scheduler'

function review(id: string, rating: 0 | 1 | 2 | 3, reviewedAt: string, canceledAt?: string): ReviewEvent {
  const previousState = initialSchedule('card-1', 'fr-es', new Date(reviewedAt))
  return { id, scheduleKey: previousState.key, entryId: previousState.entryId, direction: 'fr-es', rating, reviewedAt, previousDueAt: reviewedAt, nextDueAt: reviewedAt, appVersion: '0.3.0', catalogVersion: 'test', schedulerVersion: 'srs-1', previousState, canceledAt }
}

describe('progress summary', () => {
  it('uses explicit learning/consolidation definitions and non-punitive effort points', () => {
    const now = new Date('2026-09-13T12:00:00Z')
    const fresh = initialSchedule('new', 'fr-es', now)
    const learning = { ...initialSchedule('learning', 'fr-es', now), state: 'LEARNING' as const, dueAt: '2026-09-13T10:00:00.000Z' }
    const consolidated: ScheduleState = { ...initialSchedule('solid', 'fr-es', now), state: 'REVIEW', intervalDays: 21, dueAt: '2026-10-04T12:00:00.000Z' }
    const due: ScheduleState = { ...initialSchedule('due', 'fr-es', now), state: 'REVIEW', intervalDays: 5, dueAt: '2026-09-12T12:00:00.000Z' }
    const difficult: ScheduleState = { ...initialSchedule('difficult', 'fr-es', now), state: 'RELEARNING', learningStep: 0, dueAt: '2026-09-13T11:00:00.000Z' }
    const reviews = [
      review('forgotten', 0, '2026-09-13T09:00:00.000Z'),
      review('correct', 2, '2026-09-12T09:00:00.000Z'),
      review('canceled', 3, '2026-09-12T10:00:00.000Z', '2026-09-12T10:01:00.000Z'),
      review('old', 3, '2026-07-01T09:00:00.000Z')
    ]
    const summary = summarizeProgress([fresh, learning, consolidated, due, difficult], reviews, now)
    expect(summary).toMatchObject({ total: 5, newCount: 1, dueCount: 3, difficultCount: 1, learningCount: 2, consolidatedCount: 1, coveragePercent: 80, recallRate30d: 50, effortPoints: 3, activeDays7: 2 })
  })

  it('keeps suspended cards out of the due count while preserving studied coverage', () => {
    const now = new Date('2026-09-13T12:00:00Z')
    const suspended: ScheduleState = { ...initialSchedule('paused', 'fr-es', now), state: 'SUSPENDED', intervalDays: 5, dueAt: '2026-09-12T12:00:00.000Z' }
    const summary = summarizeProgress([suspended], [], now)
    expect(summary).toMatchObject({ total: 1, newCount: 0, dueCount: 0, difficultCount: 0, learningCount: 0, coveragePercent: 100 })
  })
})
