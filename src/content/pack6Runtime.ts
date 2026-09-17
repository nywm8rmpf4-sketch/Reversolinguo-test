import canonicalEntriesJson from '../../catalogs/fr-es/a1/catalog.json'
import manifestJson from '../../catalogs/fr-es/a1/manifest.json'
import { adultPackId, adultPacksInitial } from './adultReference'
import { materializeSchoolAssignments } from './catalogProjection'
import { legacyPack6School6eAssignments, legacyPack6VoyageA1EntryIds } from './legacyPack6Projection'
import { resolveLearningPack, validateLearningPackGraph, type LearningPack, type PackEntry } from './packs'
import { boundRuntimeProjection } from './runtimeProjection'
import { schoolPacks2026_2027 } from './schoolReference'
import { canonicalThemeIds, canonicalThemes, themeIdsForEntry, v1_0_1ThemeAssignments, type CanonicalThemeId } from './taxonomy'
import { voyagePackId, voyageThemePacks } from './themePaths'

interface CanonicalEntryForPack6B {
  entry_id: string
  status: 'draft' | 'reviewed' | 'validated' | 'withdrawn'
  provenance: {
    reviewed_at?: string
  }
}

interface RuntimeManifest {
  catalog_version: string
}

export interface Pack6BRuntimeValidationResult {
  valid: boolean
  errors: string[]
}

export const pack6BVersion = '2026.09-pack6b-r1'
export const a1MacroRuntimeVersion = (manifestJson as RuntimeManifest).catalog_version

const canonicalEntries = canonicalEntriesJson as CanonicalEntryForPack6B[]
const canonicalEntryIds = new Set(canonicalEntries.map((entry) => entry.entry_id))
const historicalV1Ids = new Set(v1_0_1ThemeAssignments.map((assignment) => assignment.entry_id))

/** Historical PACK-6B promotion is derived from its immutable review metadata. */
export const pack6BPromotedEntryIds = canonicalEntries
  .filter((entry) => !historicalV1Ids.has(entry.entry_id) && entry.provenance.reviewed_at === '2026-09-14')
  .map((entry) => entry.entry_id)

const pack6BPromotedSet = new Set(pack6BPromotedEntryIds)
export const a1MacroPromotedEntryIds = canonicalEntries
  .filter((entry) => !historicalV1Ids.has(entry.entry_id) && !pack6BPromotedSet.has(entry.entry_id))
  .map((entry) => entry.entry_id)
const macroPromotedSet = new Set(a1MacroPromotedEntryIds)
const adultA1EntryIds = canonicalEntries.filter((entry) => entry.status !== 'withdrawn').map((entry) => entry.entry_id)
const boundProjection = boundRuntimeProjection()

function relation(entry_id: string, priority: number, theme?: CanonicalThemeId, introducedIn = pack6BVersion): PackEntry {
  const resolvedTheme = theme ?? themeIdsForEntry(entry_id)[0]
  if (!resolvedTheme) throw new Error(`A1 runtime entry has no canonical theme: ${entry_id}`)
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

function voyageEntriesForA1(): PackEntry[] | undefined {
  if (boundProjection) {
    const assignments = boundProjection.theme_path_assignments.filter((assignment) => assignment.path_id === 'voyage' && assignment.cefr_level === 'A1')
    if (assignments.length === 0) return undefined
    return assignments.map((assignment, index) => relation(
      assignment.entry_id,
      index + 1,
      assignment.theme,
      boundProjection.catalog_version
    ))
  }
  return legacyPack6VoyageA1EntryIds.map((entryId, index) => relation(entryId, index + 1, 'voyage'))
}

export const pack6BAdultPacks: LearningPack[] = adultPacksInitial.map((pack) => {
  if (pack.pack_id !== adultPackId('A1')) return { ...pack, entries: [...pack.entries] }
  return {
    ...pack,
    pack_version: a1MacroRuntimeVersion,
    themes: canonicalThemes.map((theme) => theme.id),
    entries: adultA1EntryIds.map((entryId, index) => relation(
      entryId,
      index + 1,
      undefined,
      macroPromotedSet.has(entryId) ? a1MacroRuntimeVersion : pack6BVersion
    ))
  }
})

export const pack6BSchoolPacks: LearningPack[] = schoolPacks2026_2027.map((pack) => {
  const projected = schoolEntriesFor(pack)
  return projected
    ? {
        ...pack,
        pack_version: boundProjection?.catalog_version ?? pack6BVersion,
        themes: themesForProjectedPack(pack, projected),
        entries: projected
      }
    : { ...pack, entries: [...pack.entries] }
})

export const pack6BThemePacks: LearningPack[] = voyageThemePacks.map((pack) => {
  if (pack.pack_id !== voyagePackId('A1')) return { ...pack, entries: [...pack.entries] }
  const projected = voyageEntriesForA1()
  return projected
    ? { ...pack, pack_version: boundProjection?.catalog_version ?? pack6BVersion, entries: projected }
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
  if (adultA1EntryIds.length !== new Set(adultA1EntryIds).size) errors.push('adult-a1-duplicates')
  if (adultA1EntryIds.some((entryId) => !canonicalEntryIds.has(entryId))) errors.push('adult-a1-unknown-entry')

  for (const entryId of pack6BPromotedEntryIds) {
    const entry = canonicalEntries.find((candidate) => candidate.entry_id === entryId)
    if (!entry || entry.status === 'draft' || entry.status === 'withdrawn' || !entry.provenance.reviewed_at) {
      errors.push(`promoted-review-metadata:${entryId}`)
    }
  }

  for (const entryId of a1MacroPromotedEntryIds) {
    const entry = canonicalEntries.find((candidate) => candidate.entry_id === entryId)
    if (!entry || entry.status === 'draft' || entry.status === 'withdrawn' || !entry.provenance.reviewed_at) {
      errors.push(`a1-macro-review-metadata:${entryId}`)
    }
  }

  const graph = validateLearningPackGraph(pack6BRuntimePacks, canonicalEntryIds, canonicalThemeIds)
  errors.push(...graph.errors.map((error) => `graph:${error}`))

  const adultA1 = pack6BAdultPacks.find((pack) => pack.pack_id === adultPackId('A1'))
  if (!adultA1 || adultA1.entries.length !== adultA1EntryIds.length) errors.push(`adult-a1-direct-count:${adultA1?.entries.length ?? 0}`)
  else if (resolveLearningPack(adultA1.pack_id, pack6BAdultPacks).length !== adultA1EntryIds.length) errors.push('adult-a1-effective-count')

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

  const voyageA1 = pack6BThemePacks.find((pack) => pack.pack_id === voyagePackId('A1'))
  const expectedVoyageCount = boundProjection
    ? boundProjection.theme_path_assignments.filter((assignment) => assignment.path_id === 'voyage' && assignment.cefr_level === 'A1').length
    : legacyPack6VoyageA1EntryIds.length
  if (expectedVoyageCount > 0 && (!voyageA1 || voyageA1.entries.length !== expectedVoyageCount)) {
    errors.push(`voyage-a1-count:${voyageA1?.entries.length ?? 0}/${expectedVoyageCount}`)
  }
  if (voyageA1 && new Set(voyageA1.entries.map((entry) => entry.entry_id)).size !== voyageA1.entries.length) errors.push('voyage-a1-duplicates')

  return { valid: errors.length === 0, errors: [...new Set(errors)] }
}
