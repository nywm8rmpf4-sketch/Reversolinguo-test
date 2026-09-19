import { adultPackId, adultPacksInitial } from './adultReference'
import { canonicalCatalogEntries, catalogManifest } from './catalog'
import { materializeSchoolAssignments } from './catalogProjection'
import { legacyPack6School6eAssignments, legacyPack6VoyageA1EntryIds } from './legacyPack6Projection'
import { resolveLearningPack, validateLearningPackGraph, type LearningPack, type PackEntry } from './packs'
import { boundRuntimeProjection } from './runtimeProjection'
import { schoolPacks2026_2027 } from './schoolReference'
import { canonicalThemeIds, canonicalThemes, themeIdsForEntry, v1_0_1ThemeAssignments, type CanonicalThemeId } from './taxonomy'
import { voyagePackId, voyageThemePacks, type ThemePathLevel } from './themePaths'

interface CanonicalEntryForPack6B {
  entry_id: string
  cefr_level: 'PRE-A1' | 'A1' | 'A2' | 'B1' | 'B2'
  themes: CanonicalThemeId[]
  status: 'draft' | 'reviewed' | 'validated' | 'withdrawn'
  provenance: {
    reviewed_at?: string
  }
}


export interface Pack6BRuntimeValidationResult {
  valid: boolean
  errors: string[]
}

export const pack6BVersion = '2026.09-pack6b-r1'
export const a1MacroRuntimeVersion = '2026.09-a1-school-r1'
export const runtimeCatalogVersion = catalogManifest.catalog_version

const canonicalEntries = canonicalCatalogEntries as CanonicalEntryForPack6B[]
const canonicalEntryIds = new Set(canonicalEntries.map((entry) => entry.entry_id))
const canonicalById = new Map(canonicalEntries.map((entry) => [entry.entry_id, entry]))
const historicalV1Ids = new Set(v1_0_1ThemeAssignments.map((assignment) => assignment.entry_id))

/** Historical A1 promotion sets remain scoped to A1 even when the runtime catalogue is cumulative. */
export const pack6BPromotedEntryIds = canonicalEntries
  .filter((entry) => entry.cefr_level === 'A1' && !historicalV1Ids.has(entry.entry_id) && entry.provenance.reviewed_at === '2026-09-14')
  .map((entry) => entry.entry_id)

const pack6BPromotedSet = new Set(pack6BPromotedEntryIds)
export const a1MacroPromotedEntryIds = canonicalEntries
  .filter((entry) => entry.cefr_level === 'A1' && !historicalV1Ids.has(entry.entry_id) && !pack6BPromotedSet.has(entry.entry_id))
  .map((entry) => entry.entry_id)
const macroPromotedSet = new Set(a1MacroPromotedEntryIds)

const activeByLevel = new Map<string, string[]>()
for (const entry of canonicalEntries) {
  if (entry.status === 'withdrawn') continue
  const values = activeByLevel.get(entry.cefr_level) ?? []
  values.push(entry.entry_id)
  activeByLevel.set(entry.cefr_level, values)
}
const adultA1EntryIds = activeByLevel.get('A1') ?? []
const adultA2EntryIds = activeByLevel.get('A2') ?? []
const adultB1EntryIds = activeByLevel.get('B1') ?? []
const boundProjection = boundRuntimeProjection()

function relation(entry_id: string, priority: number, theme?: CanonicalThemeId, introducedIn = runtimeCatalogVersion): PackEntry {
  const resolvedTheme = theme ?? themeIdsForEntry(entry_id)[0] ?? canonicalById.get(entry_id)?.themes?.[0]
  if (!resolvedTheme) throw new Error(`Runtime entry has no canonical theme: ${entry_id}`)
  return {
    entry_id,
    role: 'core',
    priority,
    introduced_in: introducedIn,
    theme: resolvedTheme
  }
}

function themesForProjectedPack(pack: LearningPack, projected: PackEntry[]): string[] {
  const used = new Set([...pack.themes, ...projected.map((entry) => entry.theme)])
  return canonicalThemes.map((theme) => theme.id).filter((themeId) => used.has(themeId))
}

function schoolEntriesFor(pack: LearningPack): PackEntry[] | undefined {
  if (boundProjection) {
    const assignments = materializeSchoolAssignments(boundProjection)
      .filter((assignment) => assignment.grade === pack.grade && assignment.track === pack.track)
    if (assignments.length === 0) return undefined
    return assignments.map((assignment, index) => relation(
      assignment.entry_id,
      index + 1,
      assignment.theme,
      boundProjection.catalog_version
    ))
  }

  if (pack.grade === '6e' && (pack.track === 'LVA' || pack.track === 'LVB')) {
    return legacyPack6School6eAssignments.map((assignment, index) => relation(assignment.entry_id, index + 1, assignment.theme))
  }
  return undefined
}

function voyageEntriesForLevel(level: ThemePathLevel): PackEntry[] | undefined {
  if (boundProjection) {
    const assignments = boundProjection.theme_path_assignments
      .filter((assignment) => assignment.path_id === 'voyage' && assignment.cefr_level === level)
    if (assignments.length === 0) return undefined
    return assignments.map((assignment, index) => relation(
      assignment.entry_id,
      index + 1,
      assignment.theme,
      boundProjection.catalog_version
    ))
  }
  if (level === 'A1') return legacyPack6VoyageA1EntryIds.map((entryId, index) => relation(entryId, index + 1, 'voyage'))
  return undefined
}

function adultEntriesForLevel(level: string): string[] {
  if (level === 'A1') return adultA1EntryIds
  if (level === 'A2') return adultA2EntryIds
  if (level === 'B1') return adultB1EntryIds
  return []
}

export const pack6BAdultPacks: LearningPack[] = adultPacksInitial.map((pack) => {
  const entryIds = adultEntriesForLevel(pack.cefr_target)
  if (entryIds.length === 0) return { ...pack, entries: [...pack.entries] }
  return {
    ...pack,
    pack_version: runtimeCatalogVersion,
    themes: canonicalThemes.map((theme) => theme.id),
    entries: entryIds.map((entryId, index) => relation(
      entryId,
      index + 1,
      undefined,
      pack.cefr_target === 'A1'
        ? (macroPromotedSet.has(entryId) ? a1MacroRuntimeVersion : pack6BVersion)
        : runtimeCatalogVersion
    ))
  }
})

export const pack6BSchoolPacks: LearningPack[] = schoolPacks2026_2027.map((pack) => {
  const projected = schoolEntriesFor(pack)
  return projected
    ? {
        ...pack,
        pack_version: boundProjection?.catalog_version ?? runtimeCatalogVersion,
        themes: themesForProjectedPack(pack, projected),
        entries: projected
      }
    : { ...pack, entries: [...pack.entries] }
})

export const pack6BThemePacks: LearningPack[] = voyageThemePacks.map((pack) => {
  const projected = voyageEntriesForLevel(pack.cefr_target as ThemePathLevel)
  return projected
    ? { ...pack, pack_version: boundProjection?.catalog_version ?? runtimeCatalogVersion, entries: projected }
    : { ...pack, entries: [...pack.entries] }
})

export const pack6BRuntimePacks: LearningPack[] = [
  ...pack6BAdultPacks,
  ...pack6BSchoolPacks,
  ...pack6BThemePacks
]

export function validatePack6BRuntime(): Pack6BRuntimeValidationResult {
  const errors: string[] = []
  if (canonicalEntryIds.size !== canonicalEntries.length) errors.push(`canonical-unique-count:${canonicalEntryIds.size}`)
  if (new Set(pack6BPromotedEntryIds).size !== pack6BPromotedEntryIds.length) errors.push('pack6b-promoted-duplicates')
  if (macroPromotedSet.size !== a1MacroPromotedEntryIds.length) errors.push('a1-macro-promoted-duplicates')

  for (const [level, entryIds] of [['A1', adultA1EntryIds], ['A2', adultA2EntryIds], ['B1', adultB1EntryIds]] as const) {
    if (entryIds.length !== new Set(entryIds).size) errors.push(`adult-${level.toLowerCase()}-duplicates`)
    if (entryIds.some((entryId) => !canonicalEntryIds.has(entryId))) errors.push(`adult-${level.toLowerCase()}-unknown-entry`)
  }

  for (const entryId of pack6BPromotedEntryIds) {
    const entry = canonicalById.get(entryId)
    if (!entry || entry.status === 'draft' || entry.status === 'withdrawn' || !entry.provenance.reviewed_at) {
      errors.push(`promoted-review-metadata:${entryId}`)
    }
  }

  for (const entryId of a1MacroPromotedEntryIds) {
    const entry = canonicalById.get(entryId)
    if (!entry || entry.status === 'draft' || entry.status === 'withdrawn' || !entry.provenance.reviewed_at) {
      errors.push(`a1-macro-review-metadata:${entryId}`)
    }
  }

  const graph = validateLearningPackGraph(pack6BRuntimePacks, canonicalEntryIds, canonicalThemeIds)
  errors.push(...graph.errors.map((error) => `graph:${error}`))

  const adultA1 = pack6BAdultPacks.find((pack) => pack.pack_id === adultPackId('A1'))
  if (!adultA1 || adultA1.entries.length !== adultA1EntryIds.length) errors.push(`adult-a1-direct-count:${adultA1?.entries.length ?? 0}/${adultA1EntryIds.length}`)
  else if (resolveLearningPack(adultA1.pack_id, pack6BAdultPacks).length !== adultA1EntryIds.length) errors.push('adult-a1-effective-count')

  const adultA2 = pack6BAdultPacks.find((pack) => pack.pack_id === adultPackId('A2'))
  if (!adultA2 || adultA2.entries.length !== adultA2EntryIds.length) errors.push(`adult-a2-direct-count:${adultA2?.entries.length ?? 0}/${adultA2EntryIds.length}`)
  else {
    const expectedCumulative = new Set([...adultA1EntryIds, ...adultA2EntryIds]).size
    if (resolveLearningPack(adultA2.pack_id, pack6BAdultPacks).length !== expectedCumulative) errors.push(`adult-a2-effective-count:${expectedCumulative}`)
  }

  const adultB1 = pack6BAdultPacks.find((pack) => pack.pack_id === adultPackId('B1'))
  if (!adultB1 || adultB1.entries.length !== adultB1EntryIds.length) errors.push(`adult-b1-direct-count:${adultB1?.entries.length ?? 0}/${adultB1EntryIds.length}`)
  else {
    const expectedCumulative = new Set([...adultA1EntryIds, ...adultA2EntryIds, ...adultB1EntryIds]).size
    if (resolveLearningPack(adultB1.pack_id, pack6BAdultPacks).length !== expectedCumulative) errors.push(`adult-b1-effective-count:${expectedCumulative}`)
  }

  if (boundProjection) {
    const expectedSchool = materializeSchoolAssignments(boundProjection)
    for (const track of ['LVA', 'LVB', 'LVC'] as const) {
      for (const grade of ['6e', '5e', '4e', '3e', 'seconde', 'premiere', 'terminale'] as const) {
        const expected = expectedSchool.filter((assignment) => assignment.track === track && assignment.grade === grade)
        if (expected.length === 0) continue
        const school = pack6BSchoolPacks.find((pack) => pack.grade === grade && pack.track === track)
        if (!school || school.entries.length !== expected.length) errors.push(`school-${grade}-${track.toLowerCase()}-count:${school?.entries.length ?? 0}/${expected.length}`)
      }
    }
  } else {
    for (const track of ['LVA', 'LVB'] as const) {
      const school = pack6BSchoolPacks.find((pack) => pack.grade === '6e' && pack.track === track)
      if (!school || school.entries.length !== legacyPack6School6eAssignments.length) {
        errors.push(`school-6e-${track.toLowerCase()}-legacy-count:${school?.entries.length ?? 0}/${legacyPack6School6eAssignments.length}`)
      }
    }
  }

  for (const level of ['A1', 'A2'] as const) {
    const voyage = pack6BThemePacks.find((pack) => pack.pack_id === voyagePackId(level))
    const expectedCount = boundProjection
      ? boundProjection.theme_path_assignments.filter((assignment) => assignment.path_id === 'voyage' && assignment.cefr_level === level).length
      : (level === 'A1' ? legacyPack6VoyageA1EntryIds.length : 0)
    if (expectedCount > 0 && (!voyage || voyage.entries.length !== expectedCount)) {
      errors.push(`voyage-${level.toLowerCase()}-count:${voyage?.entries.length ?? 0}/${expectedCount}`)
    }
    if (voyage && new Set(voyage.entries.map((entry) => entry.entry_id)).size !== voyage.entries.length) {
      errors.push(`voyage-${level.toLowerCase()}-duplicates`)
    }
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)] }
}
