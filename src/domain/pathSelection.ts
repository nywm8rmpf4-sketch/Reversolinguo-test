import { adultInitialDeliveryLevels, adultPackId, type AdultCefrLevel } from '../content/adultReference'
import { pack6BRuntimePacks } from '../content/pack6Runtime'
import type { LearningPack, PackEntry, PackTrack } from '../content/packs'
import type { SchoolGrade } from '../content/schoolReference'
import { canonicalThemes, themeIdsForEntry, type CanonicalThemeId } from '../content/taxonomy'
import { voyageLevels, voyagePackId, type ThemePathLevel } from '../content/themePaths'

export type PathAudience = 'school' | 'adult' | 'theme'
export type ReviewScope = 'all-due' | 'selection-only'

export interface PathPreferences {
  audience: PathAudience
  selectedPackIds: string[]
  selectedThemeIds: CanonicalThemeId[]
  reviewScope: ReviewScope
}

export interface LegacyPathPreferenceInput {
  primaryPackId?: string
  focusThemeIds?: CanonicalThemeId[]
  adultScope?: 'cumulative' | 'new-only'
}

export interface ThemeChoice {
  id: CanonicalThemeId
  label_fr: string
  count: number
}

export interface PathSummary {
  audience: PathAudience
  selectedPacks: LearningPack[]
  sourceEntries: PackEntry[]
  selectedNewEntries: PackEntry[]
  sourceCount: number
  selectedNewCount: number
  availableThemes: ThemeChoice[]
  frameworks: string[]
  frameworkVersions: string[]
  cefrTargets: string[]
}

const schoolGradeOrder: SchoolGrade[] = ['6e', '5e', '4e', '3e', 'seconde', 'premiere', 'terminale']
const schoolTrackOrder: Array<Extract<PackTrack, 'LVA' | 'LVB'>> = ['LVA', 'LVB']

export const selectableSchoolPacks = schoolGradeOrder.flatMap((grade) =>
  schoolTrackOrder.flatMap((track) => {
    const pack = pack6BRuntimePacks.find((candidate) => candidate.audience === 'school' && candidate.grade === grade && candidate.track === track)
    return pack ? [pack] : []
  })
)

export const selectableAdultPacks = adultInitialDeliveryLevels.flatMap((level) => {
  const pack = pack6BRuntimePacks.find((candidate) => candidate.pack_id === adultPackId(level))
  return pack ? [pack] : []
})

export const selectableThemePacks = voyageLevels.flatMap((level) => {
  const pack = pack6BRuntimePacks.find((candidate) => candidate.pack_id === voyagePackId(level))
  return pack ? [pack] : []
})

export const selectablePacks = [...selectableSchoolPacks, ...selectableAdultPacks, ...selectableThemePacks]

function packsForAudience(audience: PathAudience): LearningPack[] {
  return selectablePacks.filter((pack) => pack.audience === audience)
}

function packById(packId: string): LearningPack | undefined {
  return selectablePacks.find((pack) => pack.pack_id === packId)
}

function defaultPackId(audience: PathAudience): string {
  if (audience === 'school') return schoolPackIdFor('6e', 'LVA')
  if (audience === 'theme') return themePackIdFor('A1')
  return adultPackIdFor('A1')
}

export const defaultPathPreferences: PathPreferences = {
  audience: 'adult',
  selectedPackIds: [adultPackId('A1')],
  selectedThemeIds: [],
  reviewScope: 'all-due'
}

function canonicalPackOrder(audience: PathAudience): Map<string, number> {
  return new Map(packsForAudience(audience).map((pack, index) => [pack.pack_id, index]))
}

export function selectedPacksFor(preferences: Pick<PathPreferences, 'audience' | 'selectedPackIds'>): LearningPack[] {
  const order = canonicalPackOrder(preferences.audience)
  return [...new Set(preferences.selectedPackIds)]
    .map(packById)
    .filter((pack): pack is LearningPack => Boolean(pack && pack.audience === preferences.audience))
    .sort((left, right) => (order.get(left.pack_id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.pack_id) ?? Number.MAX_SAFE_INTEGER))
}

/**
 * R6: selected classes/levels contribute only entries introduced directly in
 * each selected pack. Inheritance remains a reference/progression property but
 * does not silently widen "new vocabulary from this level".
 */
export function directEntriesForSelection(preferences: Pick<PathPreferences, 'audience' | 'selectedPackIds'>): PackEntry[] {
  const byId = new Map<string, PackEntry>()
  for (const pack of selectedPacksFor(preferences)) {
    for (const entry of pack.entries) {
      if (!byId.has(entry.entry_id)) byId.set(entry.entry_id, entry)
    }
  }
  return [...byId.values()]
}

function matchesThemes(entryId: string, selectedThemeIds: readonly CanonicalThemeId[]): boolean {
  if (selectedThemeIds.length === 0) return true
  const selected = new Set<CanonicalThemeId>(selectedThemeIds)
  return themeIdsForEntry(entryId).some((themeId) => selected.has(themeId))
}

export function selectedNewEntriesFor(preferences: PathPreferences): PackEntry[] {
  return directEntriesForSelection(preferences).filter((entry) => matchesThemes(entry.entry_id, preferences.selectedThemeIds))
}

export function summarizePath(preferences: PathPreferences): PathSummary {
  const selectedPacks = selectedPacksFor(preferences)
  const sourceEntries = directEntriesForSelection(preferences)
  const selectedNewEntries = sourceEntries.filter((entry) => matchesThemes(entry.entry_id, preferences.selectedThemeIds))
  const themeCounts = new Map<CanonicalThemeId, number>()

  for (const entry of sourceEntries) {
    for (const themeId of themeIdsForEntry(entry.entry_id)) {
      themeCounts.set(themeId, (themeCounts.get(themeId) ?? 0) + 1)
    }
  }

  const availableThemes = canonicalThemes
    .map((theme) => ({ ...theme, count: themeCounts.get(theme.id) ?? 0 }))
    .filter((theme) => theme.count > 0)

  return {
    audience: preferences.audience,
    selectedPacks,
    sourceEntries,
    selectedNewEntries,
    sourceCount: sourceEntries.length,
    selectedNewCount: selectedNewEntries.length,
    availableThemes,
    frameworks: [...new Set(selectedPacks.map((pack) => pack.framework))],
    frameworkVersions: [...new Set(selectedPacks.map((pack) => pack.framework_version))],
    cefrTargets: [...new Set(selectedPacks.map((pack) => pack.cefr_target))]
  }
}

export function normalizePathPreferences(
  input: Partial<PathPreferences> & LegacyPathPreferenceInput
): PathPreferences {
  const legacyPack = typeof input.primaryPackId === 'string' ? packById(input.primaryPackId) : undefined
  const requestedAudience: PathAudience = input.audience === 'school' || input.audience === 'theme' || input.audience === 'adult'
    ? input.audience
    : legacyPack?.audience ?? defaultPathPreferences.audience

  const requestedPackIds = Array.isArray(input.selectedPackIds)
    ? input.selectedPackIds.filter((item): item is string => typeof item === 'string')
    : legacyPack ? [legacyPack.pack_id] : []

  const validIds = new Set(packsForAudience(requestedAudience).map((pack) => pack.pack_id))
  const selectedPackIds = [...new Set(requestedPackIds)].filter((packId) => validIds.has(packId))
  if (selectedPackIds.length === 0) selectedPackIds.push(defaultPackId(requestedAudience))

  const requestedThemes = Array.isArray(input.selectedThemeIds)
    ? input.selectedThemeIds
    : Array.isArray(input.focusThemeIds) ? input.focusThemeIds : []
  const knownThemes = new Set(canonicalThemes.map((theme) => theme.id))
  const selectedThemeIds = [...new Set(requestedThemes)].filter((themeId): themeId is CanonicalThemeId => knownThemes.has(themeId as CanonicalThemeId))

  const reviewScope: ReviewScope = input.reviewScope === 'selection-only' ? 'selection-only' : 'all-due'
  return { audience: requestedAudience, selectedPackIds, selectedThemeIds, reviewScope }
}

export function schoolPackIdFor(grade: SchoolGrade, track: Extract<PackTrack, 'LVA' | 'LVB'>): string {
  const pack = selectableSchoolPacks.find((candidate) => candidate.grade === grade && candidate.track === track)
  if (!pack) throw new Error(`School pack unavailable: ${grade}/${track}`)
  return pack.pack_id
}

export function adultPackIdFor(level: AdultCefrLevel): string {
  const packId = adultPackId(level)
  if (!selectableAdultPacks.some((pack) => pack.pack_id === packId)) throw new Error(`Adult pack unavailable: ${level}`)
  return packId
}

export function themePackIdFor(level: ThemePathLevel): string {
  const packId = voyagePackId(level)
  if (!selectableThemePacks.some((pack) => pack.pack_id === packId)) throw new Error(`Voyage pack unavailable: ${level}`)
  return packId
}

export function labelForPath(summary: PathSummary): string {
  if (summary.selectedPacks.length === 0) return 'Aucune sélection'
  if (summary.audience === 'school') {
    return summary.selectedPacks.map((pack) => `${pack.grade ?? ''} ${pack.track ?? ''}`.trim()).join(' + ')
  }
  if (summary.audience === 'adult') return `International · ${summary.selectedPacks.map((pack) => pack.cefr_target).join(' + ')}`
  return `Voyage · ${summary.selectedPacks.map((pack) => pack.cefr_target).join(' + ')}`
}
