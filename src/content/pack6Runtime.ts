import canonicalEntriesJson from '../../catalogs/fr-es/a1/catalog.json'
import { adultPackId, adultPacksInitial } from './adultReference'
import { resolveLearningPack, validateLearningPackGraph, type LearningPack, type PackEntry } from './packs'
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

export interface Pack6BRuntimeValidationResult {
  valid: boolean
  errors: string[]
}

export const pack6BVersion = '2026.09-pack6b-r1'
export const a1MacroRuntimeVersion = '2026.09-a1-macro-r1'

export const pack6BPromotedEntryIds = [
  'd99ce5ca-6c21-573e-adfa-b5645fe9e7a1',
  '4f9d2815-6450-581c-8243-f1e4e6614767',
  '1c784a4f-fb09-573b-a3aa-5a21c5bab8ac',
  '0fe1892f-6c12-5e49-a7f4-869b087c2f5f',
  '04a4107e-e9bd-5ab4-9c7c-3142bfcdbc11',
  '26a04c4f-d6b9-563e-a58f-c98211b37507',
  '3a36fd0f-b479-5ce8-8872-6b511665bd13',
  '98ada9f9-6be3-51b1-9b6e-6ad154680e26',
  '7578519f-22d5-5ccd-9ca1-038c97977078',
  '06dcb787-68c0-5ab9-97de-27fb5166f384',
  '028d1d90-02b5-5379-9844-e48e634bcab4',
  '773d1c7c-e267-594e-9c36-ad1baf5848a9',
  '2f63de83-9ba8-54c8-b5ed-eb90fde64bb0',
  'beb23a33-b6d4-527d-b43c-cfe8298b1f4e',
  'e2fb7261-9bb9-5c64-81b6-0c54019d8fb7',
  'acd64004-1e77-5d46-97ab-ffb890a5c716',
  '40a225c7-86ab-5220-968d-9aee82d4a189',
  '333820c1-60c2-58b5-a9f7-beb68fe50d9f',
  '0e9351c9-be6d-56ac-abad-45c8f3c1cb4d',
  '7c024e4d-350c-5a40-95e6-2d977d14c1a9',
  '8477ff78-c572-52e3-8788-00f207b451a6',
  '7ccd66db-2565-51f1-ae67-e4eeb4a9656d',
  '48e9e577-1c21-55ed-b849-c8e7a83aac4a',
  'fe984172-dd41-546e-ac2e-18f679281f6b',
  'd6d6b52c-4a1f-565a-af53-44a3af978e00',
  'd0b8607e-1a31-5edb-a105-049c178254db',
  'fb376961-e569-5785-ad44-71a322efaedd',
  'ce6dbab4-4e97-53d7-b245-554840db0a1b',
  'e34538ad-78cc-51a3-99ca-81bec718ddcb',
  'b7b897ba-e46e-597a-a30f-fc4feb698c6f',
  '3a7313a4-042a-5faf-b4f2-9f877f4299df',
  '0c6a66c8-0f6a-5255-95e0-6bbf7cb6b2d1',
  '6eaf1598-5e0c-5377-a8c6-e5dd07695b60',
  '633c5a80-dc55-59e0-92f5-12209e3d9f5d',
  '4fa70eb3-8cff-57c8-abdc-3c9c397833dc',
  'da4eb86b-c9e6-591a-b7ed-de2f7248fb7a'
] as const

const pack6BSchool6eAssignments: ReadonlyArray<{ entry_id: string; theme: CanonicalThemeId }> = [
  { entry_id: 'd99ce5ca-6c21-573e-adfa-b5645fe9e7a1', theme: 'famille-relations' },
  { entry_id: '4f9d2815-6450-581c-8243-f1e4e6614767', theme: 'famille-relations' },
  { entry_id: '1c784a4f-fb09-573b-a3aa-5a21c5bab8ac', theme: 'famille-relations' },
  { entry_id: '0fe1892f-6c12-5e49-a7f4-869b087c2f5f', theme: 'description' },
  { entry_id: '04a4107e-e9bd-5ab4-9c7c-3142bfcdbc11', theme: 'description' },
  { entry_id: '26a04c4f-d6b9-563e-a58f-c98211b37507', theme: 'description' },
  { entry_id: '028d1d90-02b5-5379-9844-e48e634bcab4', theme: 'description' },
  { entry_id: '2f63de83-9ba8-54c8-b5ed-eb90fde64bb0', theme: 'ecole-etudes' },
  { entry_id: 'beb23a33-b6d4-527d-b43c-cfe8298b1f4e', theme: 'ecole-etudes' },
  { entry_id: 'e2fb7261-9bb9-5c64-81b6-0c54019d8fb7', theme: 'ecole-etudes' },
  { entry_id: 'acd64004-1e77-5d46-97ab-ffb890a5c716', theme: 'nature-environnement' },
  { entry_id: '40a225c7-86ab-5220-968d-9aee82d4a189', theme: 'nature-environnement' },
  { entry_id: '333820c1-60c2-58b5-a9f7-beb68fe50d9f', theme: 'nature-environnement' },
  { entry_id: '7c024e4d-350c-5a40-95e6-2d977d14c1a9', theme: 'ecole-etudes' },
  { entry_id: '8477ff78-c572-52e3-8788-00f207b451a6', theme: 'loisirs' },
  { entry_id: '7ccd66db-2565-51f1-ae67-e4eeb4a9656d', theme: 'maison' },
  { entry_id: '48e9e577-1c21-55ed-b849-c8e7a83aac4a', theme: 'maison' },
  { entry_id: 'fe984172-dd41-546e-ac2e-18f679281f6b', theme: 'maison' },
  { entry_id: 'ce6dbab4-4e97-53d7-b245-554840db0a1b', theme: 'loisirs' },
  { entry_id: 'e34538ad-78cc-51a3-99ca-81bec718ddcb', theme: 'loisirs' },
  { entry_id: 'b7b897ba-e46e-597a-a30f-fc4feb698c6f', theme: 'loisirs' },
  { entry_id: '3a7313a4-042a-5faf-b4f2-9f877f4299df', theme: 'description' },
  { entry_id: '0c6a66c8-0f6a-5255-95e0-6bbf7cb6b2d1', theme: 'description' },
  { entry_id: '6eaf1598-5e0c-5377-a8c6-e5dd07695b60', theme: 'description' },
  { entry_id: '4fa70eb3-8cff-57c8-abdc-3c9c397833dc', theme: 'espace-orientation' }
]

export const pack6BVoyageA1EntryIds = [
  'fe984172-dd41-546e-ac2e-18f679281f6b',
  '633c5a80-dc55-59e0-92f5-12209e3d9f5d',
  '4fa70eb3-8cff-57c8-abdc-3c9c397833dc',
  'da4eb86b-c9e6-591a-b7ed-de2f7248fb7a'
] as const

const canonicalEntries = canonicalEntriesJson as CanonicalEntryForPack6B[]
const canonicalEntryIds = new Set(canonicalEntries.map((entry) => entry.entry_id))
const legacyAdultA1EntryIds = [
  ...v1_0_1ThemeAssignments.map((assignment) => assignment.entry_id),
  ...pack6BPromotedEntryIds
]
export const a1MacroPromotedEntryIds = canonicalEntries.slice(legacyAdultA1EntryIds.length).map((entry) => entry.entry_id)
const macroPromotedSet = new Set(a1MacroPromotedEntryIds)
const adultA1EntryIds = canonicalEntries.filter((entry) => entry.status !== 'withdrawn').map((entry) => entry.entry_id)

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
  if (pack.grade !== '6e' || (pack.track !== 'LVA' && pack.track !== 'LVB')) return { ...pack, entries: [...pack.entries] }
  return {
    ...pack,
    pack_version: pack6BVersion,
    entries: pack6BSchool6eAssignments.map((assignment, index) => relation(assignment.entry_id, index + 1, assignment.theme))
  }
})

export const pack6BThemePacks: LearningPack[] = voyageThemePacks.map((pack) => {
  if (pack.pack_id !== voyagePackId('A1')) return { ...pack, entries: [...pack.entries] }
  return {
    ...pack,
    pack_version: pack6BVersion,
    entries: pack6BVoyageA1EntryIds.map((entryId, index) => relation(entryId, index + 1, 'voyage'))
  }
})

export const pack6BRuntimePacks: LearningPack[] = [
  ...pack6BAdultPacks,
  ...pack6BSchoolPacks,
  ...pack6BThemePacks
]

export function validatePack6BRuntime(): Pack6BRuntimeValidationResult {
  const errors: string[] = []
  const promotedSet = new Set(pack6BPromotedEntryIds)

  if (canonicalEntries.length !== 475) errors.push(`canonical-count:${canonicalEntries.length}`)
  if (canonicalEntryIds.size !== canonicalEntries.length) errors.push(`canonical-unique-count:${canonicalEntryIds.size}`)
  if (promotedSet.size !== 36) errors.push(`promoted-count:${promotedSet.size}`)
  if (a1MacroPromotedEntryIds.length !== 415 || macroPromotedSet.size !== 415) errors.push(`a1-macro-promoted-count:${a1MacroPromotedEntryIds.length}`)
  if (adultA1EntryIds.length !== 475 || new Set(adultA1EntryIds).size !== 475) errors.push('adult-a1-entry-set')
  if (adultA1EntryIds.some((entryId) => !canonicalEntryIds.has(entryId))) errors.push('adult-a1-unknown-entry')

  for (const entryId of pack6BPromotedEntryIds) {
    const entry = canonicalEntries.find((candidate) => candidate.entry_id === entryId)
    if (!entry) errors.push(`missing-promoted-entry:${entryId}`)
    else if (entry.status !== 'reviewed' || entry.provenance.reviewed_at !== '2026-09-14') {
      errors.push(`promoted-review-metadata:${entryId}`)
    }
  }

  for (const entryId of a1MacroPromotedEntryIds) {
    const entry = canonicalEntries.find((candidate) => candidate.entry_id === entryId)
    if (!entry) errors.push(`missing-a1-macro-entry:${entryId}`)
    else if (entry.status !== 'reviewed' || entry.provenance.reviewed_at !== '2026-09-16') {
      errors.push(`a1-macro-review-metadata:${entryId}`)
    }
  }

  const graph = validateLearningPackGraph(pack6BRuntimePacks, canonicalEntryIds, canonicalThemeIds)
  errors.push(...graph.errors.map((error) => `graph:${error}`))

  const adultA1 = pack6BAdultPacks.find((pack) => pack.pack_id === adultPackId('A1'))
  if (!adultA1 || adultA1.entries.length !== 475) errors.push(`adult-a1-direct-count:${adultA1?.entries.length ?? 0}`)
  else if (resolveLearningPack(adultA1.pack_id, pack6BAdultPacks).length !== 475) errors.push('adult-a1-effective-count')

  for (const track of ['LVA', 'LVB'] as const) {
    const school = pack6BSchoolPacks.find((pack) => pack.grade === '6e' && pack.track === track)
    if (!school || school.entries.length !== 25) errors.push(`school-6e-${track.toLowerCase()}-count:${school?.entries.length ?? 0}`)
  }

  const voyageA1 = pack6BThemePacks.find((pack) => pack.pack_id === voyagePackId('A1'))
  if (!voyageA1 || voyageA1.entries.length !== 4) errors.push(`voyage-a1-count:${voyageA1?.entries.length ?? 0}`)
  else if (new Set(voyageA1.entries.map((entry) => entry.entry_id)).size !== 4) errors.push('voyage-a1-duplicates')

  return { valid: errors.length === 0, errors: [...new Set(errors)] }
}
