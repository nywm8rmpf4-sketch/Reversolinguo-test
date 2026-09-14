import type { PackEntry } from '../content/packs'
import type { CanonicalThemeId } from '../content/taxonomy'
import type { ScheduleState } from './model'
import { orderSession } from './scheduler'

function themeByEntry(entries: readonly PackEntry[]): Map<string, string> {
  return new Map(entries.map((entry) => [entry.entry_id, entry.theme]))
}

/**
 * A thematic focus only narrows NEW cards. Existing due learning/review states
 * remain eligible regardless of theme and are still ordered first by orderSession().
 * No ScheduleState is cloned or mutated.
 */
export function orderSessionWithFocus(
  states: readonly ScheduleState[],
  packEntries: readonly PackEntry[],
  focusThemeIds: readonly CanonicalThemeId[],
  now: Date,
  newLimit = 5
): ScheduleState[] {
  const entryThemes = themeByEntry(packEntries)
  const focus = new Set<string>(focusThemeIds)

  const eligible = focus.size === 0
    ? [...states]
    : states.filter((state) => state.state !== 'NEW' || focus.has(entryThemes.get(state.entryId) ?? ''))

  return orderSession(eligible, now, newLimit, entryThemes)
}
