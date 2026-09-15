import { adultInitialDeliveryLevels, adultPackId, type AdultCefrLevel, type AdultPackScope } from '../content/adultReference'
import { pack6BRuntimePacks } from '../content/pack6Runtime'
import { resolveLearningPack, type LearningPack, type PackEntry, type PackTrack } from '../content/packs'
import { type SchoolGrade } from '../content/schoolReference'
import { canonicalThemes, type CanonicalThemeId } from '../content/taxonomy'
import { voyageLevels, voyagePackId, type ThemePathLevel } from '../content/themePaths'

export type PathAudience = 'school' | 'adult' | 'theme'

export interface PathPreferences {
  primaryPackId: string
  focusThemeIds: CanonicalThemeId[]
  adultScope: AdultPackScope
}

export interface PathSummary {
  pack: LearningPack
  audience: PathAudience
  effectiveEntries: PackEntry[]
  directCount: number
  inheritedCount: number
  effectiveCount: number
  availableFocusThemes: Array<{ id: CanonicalThemeId; label_fr: string }>
}

export const defaultPrimaryPackId = adultPackId('A1')
export const defaultPathPreferences: PathPreferences = {
  primaryPackId: defaultPrimaryPackId,
  focusThemeIds: [],
  adultScope: 'cumulative'
}

const schoolGradeOrder: SchoolGrade[] = ['6e', '5e', '4e', '3e', 'seconde', 'premiere', 'terminale']
const schoolTrackOrder: PackTrack[] = ['LVA', 'LVB']

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

function packById(packId: string): LearningPack | undefined {
  return selectablePacks.find((pack) => pack.pack_id === packId)
}

function packsForAudience(audience: PathAudience): LearningPack[] {
  return pack6BRuntimePacks.filter((pack) => pack.audience === audience)
}

export function effectiveEntriesForPath(packId: string, adultScope: AdultPackScope): PackEntry[] {
  const pack = packById(packId)
  if (!pack) throw new Error(`Unknown selectable pack: ${packId}`)
  if (pack.audience === 'adult' && adultScope === 'new-only') return [...pack.entries]
  return resolveLearningPack(pack.pack_id, packsForAudience(pack.audience))
}

export function summarizePath(preferences: PathPreferences): PathSummary {
  const pack = packById(preferences.primaryPackId) ?? packById(defaultPrimaryPackId)
  if (!pack) throw new Error('Default Adult A1 pack is unavailable')
  const adultScope = pack.audience === 'adult' ? preferences.adultScope : 'cumulative'
  const effectiveEntries = effectiveEntriesForPath(pack.pack_id, adultScope)
  const effectiveThemeIds = new Set(effectiveEntries.map((entry) => entry.theme))
  const availableFocusThemes = pack.audience === 'theme'
    ? []
    : canonicalThemes.filter((theme) => effectiveThemeIds.has(theme.id))

  return {
    pack,
    audience: pack.audience,
    effectiveEntries,
    directCount: pack.entries.length,
    inheritedCount: Math.max(0, effectiveEntries.length - pack.entries.length),
    effectiveCount: effectiveEntries.length,
    availableFocusThemes: [...availableFocusThemes]
  }
}

export function normalizePathPreferences(input: Partial<PathPreferences>): PathPreferences {
  const requestedPack = typeof input.primaryPackId === 'string' ? packById(input.primaryPackId) : undefined
  const primaryPackId = requestedPack?.pack_id ?? defaultPrimaryPackId
  const adultScope: AdultPackScope = input.adultScope === 'new-only' ? 'new-only' : 'cumulative'
  const provisional: PathPreferences = { primaryPackId, adultScope, focusThemeIds: [] }
  const allowed = new Set(summarizePath(provisional).availableFocusThemes.map((theme) => theme.id))
  const focusThemeIds = [...new Set(input.focusThemeIds ?? [])].filter((theme): theme is CanonicalThemeId => allowed.has(theme as CanonicalThemeId))
  return { ...provisional, focusThemeIds }
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
  if (summary.pack.audience === 'school') return `${summary.pack.grade ?? ''} · ${summary.pack.track ?? ''}`
  if (summary.pack.audience === 'adult') return `Adulte · ${summary.pack.cefr_target}`
  return `Voyage · ${summary.pack.cefr_target}`
}
