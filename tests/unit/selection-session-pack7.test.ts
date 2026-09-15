import { describe, expect, it } from 'vitest'
import type { PackEntry } from '../../src/content/packs'
import { initialSchedule } from '../../src/domain/scheduler'
import { orderSelectedSession, statesForSelection } from '../../src/domain/selectionSession'
import type { ScheduleState } from '../../src/domain/model'

const selectedEntry: PackEntry = {
  entry_id: 'selected', role: 'core', priority: 1, theme: 'voyage'
}
const catalogIds = new Set(['selected', 'outside'])
const now = new Date('2026-09-15T08:00:00Z')

function dueReview(entryId: string): ScheduleState {
  return {
    ...initialSchedule(entryId, 'fr-es', now),
    state: 'REVIEW',
    intervalDays: 5,
    dueAt: new Date(now.getTime() - 60_000).toISOString()
  }
}

describe('PACK-7 R6 selected session projection', () => {
  it('all-due keeps an already learned due card outside the new-vocabulary selection', () => {
    const selectedNew = initialSchedule('selected', 'fr-es', now)
    const outsideDue = dueReview('outside')
    const states = [selectedNew, outsideDue]
    const before = structuredClone(states)

    const projected = statesForSelection(states, [selectedEntry], catalogIds, 'all-due')
    expect(projected.map((state) => state.entryId)).toEqual(['selected', 'outside'])
    expect(states).toEqual(before)

    const ordered = orderSelectedSession(states, [selectedEntry], catalogIds, 'all-due', now, 5)
    expect(ordered[0].entryId).toBe('outside')
    expect(ordered[1].entryId).toBe('selected')
  })

  it('selection-only hides the same outside due card without mutating its schedule', () => {
    const selectedNew = initialSchedule('selected', 'fr-es', now)
    const outsideDue = dueReview('outside')
    const before = structuredClone(outsideDue)

    const projected = statesForSelection([selectedNew, outsideDue], [selectedEntry], catalogIds, 'selection-only')
    expect(projected.map((state) => state.entryId)).toEqual(['selected'])
    expect(outsideDue).toEqual(before)
  })

  it('restores the exact due state when the selection is widened again', () => {
    const selectedNew = initialSchedule('selected', 'fr-es', now)
    const outsideDue = dueReview('outside')
    const before = structuredClone(outsideDue)
    const states = [selectedNew, outsideDue]

    const narrowed = statesForSelection(states, [selectedEntry], catalogIds, 'selection-only')
    expect(narrowed.map((state) => state.entryId)).toEqual(['selected'])

    const outsideEntry: PackEntry = {
      entry_id: 'outside', role: 'core', priority: 2, theme: 'voyage'
    }
    const widened = statesForSelection(states, [selectedEntry, outsideEntry], catalogIds, 'selection-only')
    expect(widened.map((state) => state.entryId)).toEqual(['selected', 'outside'])
    expect(widened.find((state) => state.entryId === 'outside')).toEqual(before)
    expect(outsideDue).toEqual(before)
  })

  it('all-due never introduces a NEW card outside the selected classes/levels/themes', () => {
    const selectedNew = initialSchedule('selected', 'fr-es', now)
    const outsideNew = initialSchedule('outside', 'fr-es', now)
    const projected = statesForSelection([selectedNew, outsideNew], [selectedEntry], catalogIds, 'all-due')
    expect(projected.map((state) => state.entryId)).toEqual(['selected'])
  })
})
