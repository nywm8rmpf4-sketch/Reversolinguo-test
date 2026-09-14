import draftEntriesJson from '../../catalogs/fr-es/a1/drafts/pack6-a1-candidates-r2.json'
import certifiedEntriesJson from '../../catalogs/fr-es/a1/catalog.json'
import { catalog } from './catalog'
import { adultPackId, adultPacksInitial } from './adultReference'
import { validateLexicalEntry } from './contracts'
import { schoolPacks2026_2027 } from './schoolReference'
import { canonicalThemeIds, type CanonicalThemeId } from './taxonomy'
import { voyagePackId, voyageThemePacks } from './themePaths'

export type Pack6DraftEntry = (typeof draftEntriesJson)[number]

export interface Pack6DraftAssignmentProposal {
  entry_id: string
  pack_id: string
  relation_theme: CanonicalThemeId
  rationale: 'adult-a1-candidate' | 'school-theme-alignment' | 'voyage-a1-minimal-utility'
}

export interface Pack6DraftValidationResult {
  valid: boolean
  errors: string[]
}

export const pack6A1DraftEntries: Pack6DraftEntry[] = draftEntriesJson

const certifiedIds = new Set(certifiedEntriesJson.map((entry) => entry.entry_id))
const certifiedSemanticKeys = new Set(certifiedEntriesJson.map((entry) => semanticKey(entry.language_tag, entry.lemma)))
const runtimeIds = new Set(catalog.map((entry) => entry.id))

const adultA1Id = adultPackId('A1')
const school6ePackIds = schoolPacks2026_2027
  .filter((pack) => pack.grade === '6e' && (pack.track === 'LVA' || pack.track === 'LVB'))
  .map((pack) => pack.pack_id)
const school6eThemes = new Set(
  schoolPacks2026_2027
    .filter((pack) => school6ePackIds.includes(pack.pack_id))
    .flatMap((pack) => pack.themes)
)
const voyageA1Id = voyagePackId('A1')

const voyageA1MinimalUtilityIds = new Set([
  'fe984172-dd41-546e-ac2e-18f679281f6b', // el baño
  '633c5a80-dc55-59e0-92f5-12209e3d9f5d', // mañana
  '4fa70eb3-8cff-57c8-abdc-3c9c397833dc', // allí
  'da4eb86b-c9e6-591a-b7ed-de2f7248fb7a' // adiós
])

function semanticKey(languageTag: string, lemma: string): string {
  return `${languageTag}:${lemma.normalize('NFC').trim().toLocaleLowerCase()}`
}

function firstKnownTheme(entry: Pack6DraftEntry): CanonicalThemeId | undefined {
  return entry.themes.find((theme): theme is CanonicalThemeId => canonicalThemeIds.has(theme as CanonicalThemeId))
}

/**
 * Editorial proposals only. They are deliberately not injected into runtime
 * LearningPack manifests before bilingual human review and canonical promotion.
 */
export const pack6A1DraftAssignmentProposals: Pack6DraftAssignmentProposal[] = pack6A1DraftEntries.flatMap((entry) => {
  const proposals: Pack6DraftAssignmentProposal[] = []
  const primaryTheme = firstKnownTheme(entry)
  if (!primaryTheme) return proposals

  proposals.push({
    entry_id: entry.entry_id,
    pack_id: adultA1Id,
    relation_theme: primaryTheme,
    rationale: 'adult-a1-candidate'
  })

  const schoolTheme = entry.themes.find((theme): theme is CanonicalThemeId =>
    canonicalThemeIds.has(theme as CanonicalThemeId) && school6eThemes.has(theme)
  )
  if (schoolTheme) {
    for (const packId of school6ePackIds) {
      proposals.push({
        entry_id: entry.entry_id,
        pack_id: packId,
        relation_theme: schoolTheme,
        rationale: 'school-theme-alignment'
      })
    }
  }

  if (voyageA1MinimalUtilityIds.has(entry.entry_id)) {
    proposals.push({
      entry_id: entry.entry_id,
      pack_id: voyageA1Id,
      relation_theme: 'voyage',
      rationale: 'voyage-a1-minimal-utility'
    })
  }

  return proposals
})

export function validatePack6A1Draft(): Pack6DraftValidationResult {
  const errors: string[] = []
  const draftIds = new Set<string>()
  const draftSemanticKeys = new Set<string>()

  if (pack6A1DraftEntries.length !== 36) errors.push(`unexpected-draft-count:${pack6A1DraftEntries.length}`)
  if (certifiedEntriesJson.length !== 24) errors.push(`certified-baseline-count-changed:${certifiedEntriesJson.length}`)
  if (catalog.length !== 24) errors.push(`runtime-baseline-count-changed:${catalog.length}`)

  for (const [index, entry] of pack6A1DraftEntries.entries()) {
    const schema = validateLexicalEntry(entry)
    if (!schema.valid) errors.push(`entry-schema:${index}:${entry.entry_id}`)

    if (entry.status !== 'draft') errors.push(`non-draft-status:${entry.entry_id}:${entry.status}`)
    if (entry.cefr_level !== 'A1') errors.push(`non-a1-entry:${entry.entry_id}:${entry.cefr_level}`)
    if (entry.provenance.license !== 'CC BY 4.0') errors.push(`wrong-license:${entry.entry_id}`)
    if ('reviewed_by' in entry.provenance || 'reviewed_at' in entry.provenance) {
      errors.push(`invented-human-review:${entry.entry_id}`)
    }

    if (draftIds.has(entry.entry_id)) errors.push(`duplicate-draft-id:${entry.entry_id}`)
    draftIds.add(entry.entry_id)
    if (certifiedIds.has(entry.entry_id)) errors.push(`certified-id-collision:${entry.entry_id}`)
    if (runtimeIds.has(entry.entry_id)) errors.push(`draft-leaked-into-runtime:${entry.entry_id}`)

    const key = semanticKey(entry.language_tag, entry.lemma)
    if (draftSemanticKeys.has(key)) errors.push(`duplicate-draft-semantic:${key}`)
    draftSemanticKeys.add(key)
    if (certifiedSemanticKeys.has(key)) errors.push(`certified-semantic-collision:${key}`)

    if (entry.themes.length === 0) errors.push(`entry-without-theme:${entry.entry_id}`)
    for (const theme of entry.themes) {
      if (!canonicalThemeIds.has(theme as CanonicalThemeId)) errors.push(`unknown-theme:${entry.entry_id}:${theme}`)
    }
  }

  const knownPackIds = new Set([
    ...adultPacksInitial.map((pack) => pack.pack_id),
    ...schoolPacks2026_2027.map((pack) => pack.pack_id),
    ...voyageThemePacks.map((pack) => pack.pack_id)
  ])
  const assignmentKeys = new Set<string>()
  const assignedAdultIds = new Set<string>()

  for (const proposal of pack6A1DraftAssignmentProposals) {
    if (!draftIds.has(proposal.entry_id)) errors.push(`assignment-unknown-draft:${proposal.entry_id}`)
    if (!knownPackIds.has(proposal.pack_id)) errors.push(`assignment-unknown-pack:${proposal.pack_id}`)
    if (!canonicalThemeIds.has(proposal.relation_theme)) errors.push(`assignment-unknown-theme:${proposal.relation_theme}`)

    const key = `${proposal.entry_id}:${proposal.pack_id}`
    if (assignmentKeys.has(key)) errors.push(`duplicate-assignment:${key}`)
    assignmentKeys.add(key)
    if (proposal.pack_id === adultA1Id) assignedAdultIds.add(proposal.entry_id)
  }

  if (assignedAdultIds.size !== pack6A1DraftEntries.length) {
    errors.push(`adult-a1-assignment-coverage:${assignedAdultIds.size}/${pack6A1DraftEntries.length}`)
  }

  for (const entryId of voyageA1MinimalUtilityIds) {
    const found = pack6A1DraftAssignmentProposals.some(
      (proposal) => proposal.entry_id === entryId && proposal.pack_id === voyageA1Id && proposal.relation_theme === 'voyage'
    )
    if (!found) errors.push(`missing-voyage-a1-proposal:${entryId}`)
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)] }
}
