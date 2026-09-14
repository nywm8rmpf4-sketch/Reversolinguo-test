import { describe, expect, it } from 'vitest'
import type { PackEntry } from '../../src/content/packs'
import type { ScheduleState } from '../../src/domain/model'
import { orderSessionWithFocus } from '../../src/domain/focusedSession'

const dueFoodId = '12d2815f-54a0-5634-871e-a9862b982c76'
const newTravelId = '69046998-47e6-5570-b469-5a5cc961a97e'
const newFoodId = 'b4e18613-8478-5b0a-8f0b-4e1a626b38f4'

function entry(entry_id: string, theme: string, priority: number): PackEntry {
  return { entry_id, role: 'core', priority, theme }
}

function state(entryId: string, learningState: ScheduleState['state'], dueAt: string): ScheduleState {
  return {
    key: `${entryId}:fr-es`,
    entryId,
    direction: 'fr-es',
    state: learningState,
    intervalDays: learningState === 'NEW' ? 0 : 3,
    dueAt,
    updatedAt: '2026-09-14T10:00:00.000Z',
    schedulerVersion: 'srs-1'
  }
}

const entries: PackEntry[] = [
  entry(dueFoodId, 'alimentation', 10),
  entry(newTravelId, 'voyage', 20),
  entry(newFoodId, 'alimentation', 30)
]

const now = new Date('2026-09-14T12:00:00.000Z')

describe('PACK-5 thematic focus session ordering', () => {
  it('never hides an already-due review outside the focus theme', () => {
    const dueFood = state(dueFoodId, 'REVIEW', '2026-09-14T09:00:00.000Z')
    const newTravel = state(newTravelId, 'NEW', '2026-09-14T12:00:00.000Z')
    const newFood = state(newFoodId, 'NEW', '2026-09-14T12:00:00.000Z')

    const ordered = orderSessionWithFocus([newTravel, newFood, dueFood], entries, ['voyage'], now, 5)

    expect(ordered.map((item) => item.entryId)).toEqual([dueFoodId, newTravelId])
    expect(ordered[0]).toBe(dueFood)
    expect(ordered).not.toContain(newFood)
  })

  it('supports multiple focus themes for NEW cards', () => {
    const dueFood = state(dueFoodId, 'REVIEW', '2026-09-14T09:00:00.000Z')
    const newTravel = state(newTravelId, 'NEW', '2026-09-14T12:00:00.000Z')
    const newFood = state(newFoodId, 'NEW', '2026-09-14T12:00:00.000Z')

    const ordered = orderSessionWithFocus([newFood, newTravel, dueFood], entries, ['voyage', 'alimentation'], now, 5)

    expect(ordered[0]).toBe(dueFood)
    expect(new Set(ordered.slice(1).map((item) => item.entryId))).toEqual(new Set([newTravelId, newFoodId]))
  })

  it('keeps normal NEW selection when there is no focus', () => {
    const newTravel = state(newTravelId, 'NEW', '2026-09-14T12:00:00.000Z')
    const newFood = state(newFoodId, 'NEW', '2026-09-14T12:00:00.000Z')

    const ordered = orderSessionWithFocus([newFood, newTravel], entries, [], now, 5)

    expect(new Set(ordered.map((item) => item.entryId))).toEqual(new Set([newTravelId, newFoodId]))
  })

  it('does not surface a future review merely because it matches the focus', () => {
    const futureTravel = state(newTravelId, 'REVIEW', '2026-09-15T12:00:00.000Z')
    const newFood = state(newFoodId, 'NEW', '2026-09-14T12:00:00.000Z')

    const ordered = orderSessionWithFocus([futureTravel, newFood], entries, ['voyage'], now, 5)

    expect(ordered).toEqual([])
  })

  it('returns original schedule objects and never creates pack-specific schedule copies', () => {
    const dueFood = state(dueFoodId, 'REVIEW', '2026-09-14T09:00:00.000Z')
    const newTravel = state(newTravelId, 'NEW', '2026-09-14T12:00:00.000Z')
    const before = JSON.stringify([dueFood, newTravel])

    const ordered = orderSessionWithFocus([dueFood, newTravel], entries, ['voyage'], now, 5)

    expect(ordered[0]).toBe(dueFood)
    expect(ordered[1]).toBe(newTravel)
    expect(JSON.stringify([dueFood, newTravel])).toBe(before)
  })
})
