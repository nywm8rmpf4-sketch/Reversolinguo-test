import { describe, expect, it } from 'vitest'
import { initialSchedule, orderSession, reviewSchedule } from '../../src/domain/scheduler'

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

  it('places due reviews before new cards and respects the new limit', () => {
    const due = { ...initialSchedule('due', 'fr-es', now), state: 'REVIEW' as const, dueAt: '2026-09-12T08:00:00.000Z' }
    const fresh = Array.from({ length: 8 }, (_, index) => initialSchedule(`new-${index}`, 'fr-es', now))
    const ordered = orderSession([...fresh, due], now, 5)
    expect(ordered[0].entryId).toBe('due')
    expect(ordered).toHaveLength(6)
  })

  it('keeps opposite directions independent', () => {
    const frEs = reviewSchedule(initialSchedule('word', 'fr-es', now), 3, now)
    const esFr = initialSchedule('word', 'es-fr', now)
    expect(frEs.key).not.toBe(esFr.key)
    expect(esFr.state).toBe('NEW')
  })

  it.each([30, 90, 365])('keeps simulated intervals within bounds for %i days', (days) => {
    let state: import('../../src/domain/model').ScheduleState = { ...initialSchedule('sim', 'fr-es', now), state: 'REVIEW', intervalDays: 3 }
    for (let index = 0; index < days; index += 1) state = reviewSchedule(state, index % 7 === 0 ? 1 : 2, new Date(state.dueAt))
    expect(state.intervalDays).toBeGreaterThanOrEqual(1)
    expect(state.intervalDays).toBeLessThanOrEqual(365)
  })
})
