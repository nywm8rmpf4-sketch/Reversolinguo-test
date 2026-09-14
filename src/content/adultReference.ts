import { resolveLearningPack, type LearningPack, type PackCefrTarget, type PackEntry } from './packs'

export type AdultCefrLevel = Extract<PackCefrTarget, 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'>
export type AdultPackScope = 'cumulative' | 'new-only'
export type AdultDeliveryStatus = 'initial' | 'architecture-ready'

export const adultCefrSources = {
  companion2020: 'https://rm.coe.int/common-european-framework-of-reference-for-languages-learning-teaching/16809ea0d4',
  descriptors: 'https://www.coe.int/en/web/common-european-framework-reference-languages/cefr-descriptors',
  levels: 'https://www.coe.int/en/web/common-european-framework-reference-languages/level-descriptions',
  globalScale: 'https://www.coe.int/en/web/common-European-framework-reference-languages/table-1-cefr-3.3-common-reference-levels-global-scale'
} as const

export interface AdultLevelDescriptor {
  level: AdultCefrLevel
  category: 'basic-user' | 'independent-user' | 'proficient-user'
  delivery_status: AdultDeliveryStatus
  communicative_orientation_fr: string
  lexical_orientation_fr: string
  source_keys: Array<keyof typeof adultCefrSources>
}

/**
 * Editorial summaries of official CEFR descriptors. They are not vocabulary
 * lists and never certify an individual learner's proficiency.
 */
export const adultLevelDescriptors: AdultLevelDescriptor[] = [
  {
    level: 'A1',
    category: 'basic-user',
    delivery_status: 'initial',
    communicative_orientation_fr: 'Besoins concrets, expressions quotidiennes très fréquentes, présentation de soi et échanges simples avec aide de l’interlocuteur.',
    lexical_orientation_fr: 'Répertoire lexical élémentaire lié à des situations concrètes particulières.',
    source_keys: ['companion2020', 'globalScale']
  },
  {
    level: 'A2',
    category: 'basic-user',
    delivery_status: 'initial',
    communicative_orientation_fr: 'Échanges simples et routiniers sur des sujets familiers ou de besoin immédiat, avec descriptions simples de l’environnement et du parcours personnel.',
    lexical_orientation_fr: 'Vocabulaire suffisant pour les besoins communicatifs de base, la survie simple et les transactions quotidiennes familières.',
    source_keys: ['companion2020', 'globalScale']
  },
  {
    level: 'B1',
    category: 'independent-user',
    delivery_status: 'initial',
    communicative_orientation_fr: 'Situations familières de travail, d’études, de loisirs et de voyage ; production d’un discours simple et connecté et justification brève de projets ou opinions.',
    lexical_orientation_fr: 'Bon éventail de vocabulaire pour les sujets familiers et la vie quotidienne, avec recours possible à la paraphrase en cas de lacune.',
    source_keys: ['companion2020', 'globalScale']
  },
  {
    level: 'B2',
    category: 'independent-user',
    delivery_status: 'initial',
    communicative_orientation_fr: 'Compréhension des idées principales de sujets concrets ou abstraits complexes, interaction assez fluide et argumentation détaillée sur un large éventail de sujets.',
    lexical_orientation_fr: 'Bon éventail lexical pour la plupart des sujets généraux et le domaine de spécialité, avec capacité à varier la formulation.',
    source_keys: ['companion2020', 'globalScale']
  },
  {
    level: 'C1',
    category: 'proficient-user',
    delivery_status: 'architecture-ready',
    communicative_orientation_fr: 'Usage souple et efficace de la langue dans des contextes sociaux, académiques ou professionnels et production structurée sur des sujets complexes.',
    lexical_orientation_fr: 'Large répertoire lexical permettant de contourner aisément les lacunes et d’utiliser des expressions idiomatiques courantes.',
    source_keys: ['companion2020', 'globalScale']
  },
  {
    level: 'C2',
    category: 'proficient-user',
    delivery_status: 'architecture-ready',
    communicative_orientation_fr: 'Compréhension très large et expression spontanée, précise et nuancée dans des situations complexes.',
    lexical_orientation_fr: 'Très large répertoire lexical incluant expressions idiomatiques et familières, avec maîtrise des nuances de sens.',
    source_keys: ['companion2020', 'globalScale']
  }
]

export const adultSupportedLevels: AdultCefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
export const adultInitialDeliveryLevels: AdultCefrLevel[] = ['A1', 'A2', 'B1', 'B2']

export function adultPackId(level: AdultCefrLevel): string {
  return `fr-es-adult-cefr-${level.toLowerCase()}`
}

function buildAdultPack(level: AdultCefrLevel, previous?: AdultCefrLevel): LearningPack {
  return {
    pack_id: adultPackId(level),
    pack_version: '2026.09-pack4-r1',
    audience: 'adult',
    language_pair: 'fr-es',
    framework: 'CEFR',
    framework_version: 'Companion-Volume-2020',
    cefr_target: level,
    inherits_from: previous ? [adultPackId(previous)] : [],
    themes: [],
    entries: [],
    sources: [adultCefrSources.companion2020, adultCefrSources.descriptors, adultCefrSources.levels, adultCefrSources.globalScale],
    status: 'draft',
    human_review: 'NOT_EXECUTED'
  }
}

export const adultPacksInitial: LearningPack[] = adultInitialDeliveryLevels.map((level, index) =>
  buildAdultPack(level, adultInitialDeliveryLevels[index - 1])
)

export function adultPackForLevel(level: AdultCefrLevel, packs: readonly LearningPack[] = adultPacksInitial): LearningPack | undefined {
  return packs.find((pack) => pack.pack_id === adultPackId(level) && pack.audience === 'adult')
}

function sortEntries(entries: readonly PackEntry[]): PackEntry[] {
  return [...entries].sort((left, right) => {
    const priority = left.priority - right.priority
    return priority !== 0 ? priority : left.entry_id.localeCompare(right.entry_id)
  })
}

/**
 * Returns a selection view only. It never reads or writes schedules/reviews and
 * therefore cannot create a second SRS identity for the same lexical entry.
 */
export function selectAdultPackEntries(
  level: AdultCefrLevel,
  scope: AdultPackScope,
  packs: readonly LearningPack[] = adultPacksInitial
): PackEntry[] {
  const pack = adultPackForLevel(level, packs)
  if (!pack) throw new Error(`Adult CEFR pack ${level} is not materialized`)

  if (scope === 'new-only') return sortEntries(pack.entries)

  const adultOnly = packs.filter((candidate) => candidate.audience === 'adult')
  return resolveLearningPack(pack.pack_id, adultOnly)
}

export interface AdultReferenceValidationResult {
  valid: boolean
  errors: string[]
}

export function validateAdultReference(packs: readonly LearningPack[] = adultPacksInitial): AdultReferenceValidationResult {
  const errors: string[] = []
  const byId = new Map(packs.map((pack) => [pack.pack_id, pack]))

  for (const pack of packs) {
    if (pack.audience !== 'adult') errors.push(`non-adult-pack:${pack.pack_id}`)
    if (pack.framework !== 'CEFR') errors.push(`wrong-framework:${pack.pack_id}`)
    if (pack.framework_version !== 'Companion-Volume-2020') errors.push(`wrong-framework-version:${pack.pack_id}`)
    if (pack.school_year !== undefined || pack.grade !== undefined || pack.track !== undefined) {
      errors.push(`school-field-on-adult-pack:${pack.pack_id}`)
    }

    for (const parentId of pack.inherits_from) {
      const parent = byId.get(parentId)
      if (!parent) errors.push(`missing-adult-parent:${pack.pack_id}:${parentId}`)
      else if (parent.audience !== 'adult') errors.push(`adult-inherits-non-adult:${pack.pack_id}:${parentId}`)
    }
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)] }
}
