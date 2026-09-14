export const canonicalThemes = [
  { id: 'identite', label_fr: 'Identité' },
  { id: 'famille-relations', label_fr: 'Famille et relations' },
  { id: 'maison', label_fr: 'Maison' },
  { id: 'ecole-etudes', label_fr: 'École et études' },
  { id: 'travail-metiers', label_fr: 'Travail et métiers' },
  { id: 'alimentation', label_fr: 'Alimentation' },
  { id: 'voyage', label_fr: 'Voyage' },
  { id: 'ville-services', label_fr: 'Ville et services' },
  { id: 'corps-sante', label_fr: 'Corps et santé' },
  { id: 'vetements', label_fr: 'Vêtements' },
  { id: 'temps', label_fr: 'Temps' },
  { id: 'meteo', label_fr: 'Météo' },
  { id: 'loisirs', label_fr: 'Loisirs' },
  { id: 'sports', label_fr: 'Sports' },
  { id: 'culture-fetes', label_fr: 'Culture et fêtes' },
  { id: 'communication', label_fr: 'Communication' },
  { id: 'numerique', label_fr: 'Numérique' },
  { id: 'nature-environnement', label_fr: 'Nature et environnement' },
  { id: 'description', label_fr: 'Description' },
  { id: 'espace-orientation', label_fr: 'Espace et orientation' }
] as const

export type CanonicalThemeId = (typeof canonicalThemes)[number]['id']

export interface LexicalThemeAssignment {
  entry_id: string
  theme_ids: CanonicalThemeId[]
}

export const v1_0_1ThemeAssignments: LexicalThemeAssignment[] = [
  { entry_id: '69046998-47e6-5570-b469-5a5cc961a97e', theme_ids: ['corps-sante'] },
  { entry_id: '36e27c44-5b63-5024-bd41-81546b1e9191', theme_ids: ['maison'] },
  { entry_id: '6d9f4fb0-63d0-5e4b-b364-5308faba9ef4', theme_ids: ['ecole-etudes'] },
  { entry_id: '12d2815f-54a0-5634-871e-a9862b982c76', theme_ids: ['alimentation'] },
  { entry_id: 'b4e18613-8478-5b0a-8f0b-4e1a626b38f4', theme_ids: ['alimentation'] },
  { entry_id: '9db7b0eb-a611-5647-abc8-452f1c4165ac', theme_ids: ['communication'] },
  { entry_id: '3a509d15-aaa6-5652-b998-b206e968f549', theme_ids: ['famille-relations'] },
  { entry_id: '030622ca-5bd3-5bfb-8a12-52c174613fc7', theme_ids: ['ecole-etudes'] },
  { entry_id: '3095b501-9c52-52d3-9a65-008d16cf4797', theme_ids: ['temps'] },
  { entry_id: '35e36774-1636-5658-bbe1-d901053c94e3', theme_ids: ['communication'] },
  { entry_id: 'e325ff6f-0b76-5c04-831b-494ae33ad4ea', theme_ids: ['description'] },
  { entry_id: 'e85c5757-34b8-556f-8305-8fd52cc2df21', theme_ids: ['famille-relations'] },
  { entry_id: '3f8fe9a4-9c63-51c7-9df1-2c74ffbd7f6c', theme_ids: ['communication'] },
  { entry_id: 'c57ef2ff-9328-5877-a607-45d64d5c5d23', theme_ids: ['communication'] },
  { entry_id: '91042cc3-273d-55ed-acc9-478a8fbdd812', theme_ids: ['communication'] },
  { entry_id: '97cccb34-ce0e-520f-9c02-081b30a17e2f', theme_ids: ['identite', 'espace-orientation'] },
  { entry_id: '55707ea2-1fba-5891-82be-e4f016e30a71', theme_ids: ['description'] },
  { entry_id: 'cfd4af70-e3ca-5e42-9f48-88c9229622f9', theme_ids: ['espace-orientation'] },
  { entry_id: '14fc9090-ec11-598c-ae22-ada502b78c2d', theme_ids: ['famille-relations'] },
  { entry_id: 'b72f23af-c8d7-571f-bb7b-2ba7794b20fd', theme_ids: ['famille-relations'] },
  { entry_id: '214eddb7-23b0-5176-9fe0-eb915002c79a', theme_ids: ['ecole-etudes', 'travail-metiers'] },
  { entry_id: 'ebdc6919-f91c-5752-b2c3-3f4b93e909b7', theme_ids: ['alimentation'] },
  { entry_id: '9fe30411-ac09-519e-bf69-ef6173f9bb86', theme_ids: ['description'] },
  { entry_id: '69aec1e9-bcb6-5d4c-9229-a78e1e8d701a', theme_ids: ['description'] }
]

export const canonicalThemeIds = new Set<CanonicalThemeId>(canonicalThemes.map((theme) => theme.id))

export function themeIdsForEntry(entryId: string): CanonicalThemeId[] {
  return v1_0_1ThemeAssignments.find((assignment) => assignment.entry_id === entryId)?.theme_ids ?? []
}

export interface TaxonomyValidationResult {
  valid: boolean
  errors: string[]
}

export function validateTaxonomyAssignments(
  assignments: readonly LexicalThemeAssignment[],
  lexicalEntryIds: ReadonlySet<string>,
  knownThemeIds: ReadonlySet<string> = canonicalThemeIds
): TaxonomyValidationResult {
  const errors: string[] = []
  const assignedEntryIds = new Set<string>()

  for (const assignment of assignments) {
    if (assignedEntryIds.has(assignment.entry_id)) errors.push(`duplicate-entry-assignment:${assignment.entry_id}`)
    assignedEntryIds.add(assignment.entry_id)
    if (!lexicalEntryIds.has(assignment.entry_id)) errors.push(`unknown-entry-assignment:${assignment.entry_id}`)
    if (assignment.theme_ids.length === 0) errors.push(`entry-without-theme:${assignment.entry_id}`)

    const localThemes = new Set<string>()
    for (const themeId of assignment.theme_ids) {
      if (localThemes.has(themeId)) errors.push(`duplicate-entry-theme:${assignment.entry_id}:${themeId}`)
      localThemes.add(themeId)
      if (!knownThemeIds.has(themeId)) errors.push(`unknown-theme:${assignment.entry_id}:${themeId}`)
    }
  }

  for (const entryId of lexicalEntryIds) {
    if (!assignedEntryIds.has(entryId)) errors.push(`missing-entry-assignment:${entryId}`)
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)] }
}
