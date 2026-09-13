import { describe, expect, it } from 'vitest'
import type { ReviewEvent, ScheduleState } from '../../src/domain/model'
import { initialSchedule, orderSession, remainingDailyNew, reviewSchedule } from '../../src/domain/scheduler'

describe('scheduler srs-1', () => {
  const now = new Date('2026-09-13T08:00:00.000Z')

  it('is deterministic and orders difficulty intervals', () => {
    const review = { ...initialSchedule('word', 'fr-es', now), state: 'REVIEW' as const, intervalDays: 10 }
    const hard = reviewSchedule(review, 1, now)
    const correct = reviewSchedule(review, 2, now)
    const easy = reviewSchedule(review, 3, now)
    expect(hard.intervalDays).toBeLessThan(correct.intervalDays)
    expect(correct.intervalDays).toBeLessThan(easy.intervalDays)
    expect(reviewSchedule(review, 2, now)).toEqual(correct)
  })

  it('applies the specified deterministic variation within plus or minus five percent', () => {
    const review = { ...initialSchedule('jitter', 'fr-es', now), state: 'REVIEW' as const, intervalDays: 100 }
    const next = reviewSchedule(review, 2, now)
    expect(next.intervalDays).toBeGreaterThanOrEqual(219)
    expect(next.intervalDays).toBeLessThanOrEqual(242)
    expect(reviewSchedule(review, 2, now).intervalDays).toBe(next.intervalDays)
  })

  it('implements the 10 minute, 1 day and 3 day learning steps', () => {
    const first = reviewSchedule(initialSchedule('word', 'fr-es', now), 2, now)
    expect(first).toMatchObject({ state: 'LEARNING', learningStep: 0, intervalDays: 0 })
    const second = reviewSchedule(first, 2, new Date(first.dueAt))
    expect(second).toMatchObject({ state: 'LEARNING', learningStep: 1, intervalDays: 1 })
    const graduated = reviewSchedule(second, 2, new Date(second.dueAt))
    expect(graduated).toMatchObject({ state: 'REVIEW', intervalDays: 3 })
  })

  it('keeps forgotten history addressable and schedules relearning', () => {
    const forgotten = reviewSchedule(initialSchedule('word', 'es-fr', now), 0, now)
    expect(forgotten.state).toBe('RELEARNING')
    expect(forgotten.dueAt).toBe('2026-09-13T08:10:00.000Z')
  })

  it('orders relearning then learning then review before new cards', () => {
    const review: ScheduleState = { ...initialSchedule('review', 'fr-es', now), state: 'REVIEW', intervalDays: 10, dueAt: '2026-09-10T08:00:00.000Z' }
    const learning: ScheduleState = { ...initialSchedule('learning', 'fr-es', now), state: 'LEARNING', learningStep: 0, dueAt: '2026-09-12T08:00:00.000Z' }
    const relearning: ScheduleState = { ...initialSchedule('relearning', 'fr-es', now), state: 'RELEARNING', learningStep: 0, dueAt: '2026-09-13T07:59:00.000Z' }
    const fresh = initialSchedule('new', 'fr-es', now)
    expect(orderSession([review, fresh, learning, relearning], now, 1).map((item) => item.entryId)).toEqual(['relearning', 'learning', 'review', 'new'])
  })

  it('alternates themes within a priority group when alternatives exist', () => {
    const states = ['a', 'b', 'c'].map((id) => ({ ...initialSchedule(id, 'fr-es', now), state: 'REVIEW' as const, intervalDays: 5, dueAt: '2026-09-12T08:00:00.000Z' }))
    const themes = new Map([['a', 'école'], ['b', 'école'], ['c', 'famille']])
    expect(orderSession(states, now, 0, themes).map((item) => item.entryId)).toEqual(['a', 'c', 'b'])
  })

  it('never schedules suspended cards even when their due date is past', () => {
    const suspended = { ...initialSchedule('paused', 'fr-es', now), state: 'SUSPENDED' as const, dueAt: '2026-09-12T08:00:00.000Z' }
    const due = { ...initialSchedule('due', 'fr-es', now), state: 'REVIEW' as const, dueAt: '2026-09-12T08:00:00.000Z' }
    expect(orderSession([suspended, due], now, 0).map((item) => item.entryId)).toEqual(['due'])
  })

  it('limits new introductions across sessions to the remaining local-day allowance', () => {
    const previousState = initialSchedule('introduced', 'fr-es', now)
    const introduced: ReviewEvent = {
      id: 'r1', scheduleKey: previousState.key, entryId: previousState.entryId, direction: 'fr-es', rating: 2,
      reviewedAt: '2026-09-13T07:30:00.000Z', previousDueAt: previousState.dueAt, nextDueAt: '2026-09-13T07:40:00.000Z',
      appVersion: '0.1.0', catalogVersion: 'test', schedulerVersion: 'srs-1', previousState
    }
    expect(remainingDailyNew([introduced], 'fr-es', now, 5)).toBe(4)
    expect(remainingDailyNew([{ ...introduced, canceledAt: '2026-09-13T07:31:00.000Z' }], 'fr-es', now, 5)).toBe(5)
    expect(remainingDailyNew([introduced], 'es-fr', now, 5)).toBe(5)
  })

  it('keeps opposite directions independent', () => {
    const frEs = reviewSchedule(initialSchedule('word', 'fr-es', now), 3, now)
    const esFr = initialSchedule('word', 'es-fr', now)
    expect(frEs.key).not.toBe(esFr.key)
    expect(esFr.state).toBe('NEW')
  })

  it.each([30, 90, 365])('keeps simulated intervals within bounds for %i days', (days) => {
    let state: ScheduleState = { ...initialSchedule('sim', 'fr-es', now), state: 'REVIEW', intervalDays: 3 }
    for (let index = 0; index < days; index += 1) state = reviewSchedule(state, index % 7 === 0 ? 1 : 2, new Date(state.dueAt))
    expect(state.intervalDays).toBeGreaterThanOrEqual(1)
    expect(state.intervalDays).toBeLessThanOrEqual(365)
  })
})
