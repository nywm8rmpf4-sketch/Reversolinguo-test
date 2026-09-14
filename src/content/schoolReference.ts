import type { LearningPack, PackCefrTarget, PackTrack } from './packs'
import type { CanonicalThemeId } from './taxonomy'

export type SchoolGrade = NonNullable<LearningPack['grade']>
export type SchoolTargetScope = 'grade-end' | 'cycle-end'
export type SchoolProgramId = 'BO2025-MENE2504621A' | 'BO2020-MENE2018714A'

export const schoolReferenceSources = {
  bo2025: 'https://www.education.gouv.fr/bo/2025/Hebdo22/MENE2504621A',
  spanishCollege2025: 'https://www.education.gouv.fr/sites/default/files/annexe-9-programme-d-espagnol-pour-les-classes-de-coll-ge-440373.pdf',
  spanishLycee2025: 'https://www.education.gouv.fr/sites/default/files/annexe-10-programme-d-espagnol-pour-les-classes-de-lyc-e-g-n-ral-et-technologique-440376.pdf',
  eduscolCollege2026: 'https://eduscol.education.fr/4758/ressources-d-accompagnement-pour-les-langues-vivantes-etrangeres-et-regionales-au-college',
  bo2020: 'https://www.education.gouv.fr/bo/20/Hebdo31/MENE2018714A.htm',
  cycle4Legacy2020: 'https://eduscol.education.fr/document/621/download'
} as const

export interface OfficialAxisReference {
  axis_id: string
  label_fr: string
  canonical_theme_ids: CanonicalThemeId[]
  mapping_status: 'editorial-alignment'
}

export interface SchoolTargetDescriptor {
  grade: SchoolGrade
  track: PackTrack
  program_id: SchoolProgramId
  scope: SchoolTargetScope
  official_label: string
  operational_target: PackCefrTarget
  note_fr?: string
}

export interface SchoolProgramApplicability {
  grade: SchoolGrade
  school_year: '2026-2027'
  program_id: SchoolProgramId
  source: string
}

export const program2025EffectiveFrom: Record<SchoolGrade, string> = {
  '6e': '2025-2026',
  '5e': '2026-2027',
  '4e': '2027-2028',
  '3e': '2028-2029',
  seconde: '2025-2026',
  premiere: '2026-2027',
  terminale: '2026-2027'
}

const program2025Axes: Record<SchoolGrade, OfficialAxisReference[]> = {
  '6e': [
    axis('2025-6e-1', 'Personnes et personnages', ['identite', 'famille-relations', 'description']),
    axis('2025-6e-2', 'Le quotidien : vivre, jouer, apprendre', ['maison', 'ecole-etudes', 'loisirs']),
    axis('2025-6e-3', 'Pays et paysages', ['voyage', 'nature-environnement', 'espace-orientation']),
    axis('2025-6e-4', 'Imaginaire, contes et légendes', ['culture-fetes']),
    axis('2025-6e-5', 'Arts et expression des sentiments', ['culture-fetes', 'identite'])
  ],
  '5e': [
    axis('2025-5e-1', 'Portrait, autoportrait', ['identite', 'description']),
    axis('2025-5e-2', 'Le quotidien : lieux, rythmes, saisons', ['maison', 'temps', 'meteo', 'ville-services']),
    axis('2025-5e-3', 'École et loisirs', ['ecole-etudes', 'loisirs']),
    axis('2025-5e-4', 'Le réel et l’imaginaire', ['culture-fetes', 'description']),
    axis('2025-5e-5', 'Des langues, des lieux, des histoires', ['communication', 'espace-orientation', 'culture-fetes']),
    axis('2025-5e-6', 'Le Mexique : partons à la découverte de ce pays fascinant !', ['voyage', 'culture-fetes', 'nature-environnement'])
  ],
  '4e': [
    axis('2025-4e-1', 'Sport et société', ['sports', 'famille-relations']),
    axis('2025-4e-2', 'Voyages et exploration', ['voyage', 'espace-orientation']),
    axis('2025-4e-3', 'Villes, villages, quartiers', ['ville-services', 'maison', 'espace-orientation']),
    axis('2025-4e-4', 'Inventer, innover, créer', ['numerique', 'culture-fetes']),
    axis('2025-4e-5', 'Langages et messages artistiques', ['communication', 'culture-fetes']),
    axis('2025-4e-6', 'L’Andalousie, terre de merveilles', ['voyage', 'culture-fetes', 'nature-environnement'])
  ],
  '3e': [
    axis('2025-3e-1', 'À la rencontre de l’autre', ['identite', 'famille-relations', 'communication']),
    axis('2025-3e-2', 'Travailler hier, aujourd’hui, demain', ['travail-metiers', 'temps']),
    axis('2025-3e-3', 'Voyages et migrations', ['voyage', 'espace-orientation']),
    axis('2025-3e-4', 'Langages et médias', ['communication', 'numerique']),
    axis('2025-3e-5', 'Formes de l’engagement', ['communication', 'famille-relations']),
    axis('2025-3e-6', '1492, l’année « admirable » ?', ['culture-fetes', 'voyage', 'temps'])
  ],
  seconde: [
    axis('2025-seconde-1', 'Représentation de soi et rapport à autrui', ['identite', 'famille-relations', 'description']),
    axis('2025-seconde-2', 'Vivre entre générations', ['famille-relations', 'temps']),
    axis('2025-seconde-3', 'Le passé dans le présent', ['temps', 'culture-fetes']),
    axis('2025-seconde-4', 'Défis et transitions', ['nature-environnement', 'travail-metiers']),
    axis('2025-seconde-5', 'Créer et recréer', ['culture-fetes', 'communication']),
    axis('2025-seconde-6', 'L’Espagne au-delà des clichés', ['culture-fetes', 'voyage', 'identite'])
  ],
  premiere: [
    axis('2025-premiere-1', 'Identités et échanges', ['identite', 'communication', 'voyage']),
    axis('2025-premiere-2', 'Diversité et inclusion', ['identite', 'famille-relations', 'communication']),
    axis('2025-premiere-3', 'Art et pouvoir', ['culture-fetes', 'communication']),
    axis('2025-premiere-4', 'Innovations scientifiques et responsabilité', ['numerique', 'nature-environnement']),
    axis('2025-premiere-5', 'L’être humain et la nature', ['nature-environnement', 'corps-sante']),
    axis('2025-premiere-6', 'L’espace andin, la colonne vertébrale de l’Amérique du sud', ['voyage', 'nature-environnement', 'espace-orientation'])
  ],
  terminale: [
    axis('2025-terminale-1', 'Espace privé et espace public', ['maison', 'ville-services', 'famille-relations']),
    axis('2025-terminale-2', 'Territoire et mémoire', ['espace-orientation', 'temps', 'culture-fetes']),
    axis('2025-terminale-3', 'Fictions et réalités', ['culture-fetes', 'communication']),
    axis('2025-terminale-4', 'Enjeux et formes de la communication', ['communication', 'numerique']),
    axis('2025-terminale-5', 'Citoyenneté et mondes virtuels', ['communication', 'numerique']),
    axis('2025-terminale-6', 'La richesse des métissages dans le monde hispanique', ['identite', 'culture-fetes', 'voyage'])
  ]
}

const cycle4LegacyAxes: OfficialAxisReference[] = [
  axis('2020-cycle4-1', 'Langages', ['communication', 'culture-fetes', 'numerique']),
  axis('2020-cycle4-2', 'École et société', ['ecole-etudes', 'famille-relations', 'travail-metiers']),
  axis('2020-cycle4-3', 'Voyages et migrations', ['voyage', 'espace-orientation']),
  axis('2020-cycle4-4', 'Rencontres avec d’autres cultures', ['identite', 'culture-fetes', 'communication'])
]

function axis(axis_id: string, label_fr: string, canonical_theme_ids: CanonicalThemeId[]): OfficialAxisReference {
  return { axis_id, label_fr, canonical_theme_ids, mapping_status: 'editorial-alignment' }
}

export const schoolProgramApplicability2026_2027: SchoolProgramApplicability[] = [
  applicability('6e', 'BO2025-MENE2504621A', schoolReferenceSources.bo2025),
  applicability('5e', 'BO2025-MENE2504621A', schoolReferenceSources.bo2025),
  applicability('4e', 'BO2020-MENE2018714A', schoolReferenceSources.bo2020),
  applicability('3e', 'BO2020-MENE2018714A', schoolReferenceSources.bo2020),
  applicability('seconde', 'BO2025-MENE2504621A', schoolReferenceSources.bo2025),
  applicability('premiere', 'BO2025-MENE2504621A', schoolReferenceSources.bo2025),
  applicability('terminale', 'BO2025-MENE2504621A', schoolReferenceSources.bo2025)
]

function applicability(grade: SchoolGrade, program_id: SchoolProgramId, source: string): SchoolProgramApplicability {
  return { grade, school_year: '2026-2027', program_id, source }
}

const newTargets: Record<SchoolGrade, Partial<Record<PackTrack, { label: string; target: PackCefrTarget }>>> = {
  '6e': { LVB: { label: 'A1', target: 'A1' }, LVA: { label: 'A1+', target: 'A1+' } },
  '5e': { LVB: { label: 'A1+', target: 'A1+' }, LVA: { label: 'A2', target: 'A2' } },
  '4e': { LVB: { label: 'A1+', target: 'A1+' }, LVA: { label: 'A2+', target: 'A2+' } },
  '3e': { LVB: { label: 'A2', target: 'A2' }, LVA: { label: 'B1', target: 'B1' } },
  seconde: {
    LVB: { label: 'A2+', target: 'A2+' },
    LVA: { label: 'B1+', target: 'B1+' },
    LVC: { label: 'A1+', target: 'A1+' }
  },
  premiere: {
    LVB: { label: 'B1', target: 'B1' },
    LVA: { label: 'B1+', target: 'B1+' },
    LVC: { label: 'A2', target: 'A2' }
  },
  terminale: {
    LVB: { label: 'B1', target: 'B1' },
    LVA: { label: 'B2', target: 'B2' },
    LVC: { label: 'A2+ / B1', target: 'A2+' }
  }
}

export function axesForSchoolGrade2026_2027(grade: SchoolGrade): OfficialAxisReference[] {
  return grade === '4e' || grade === '3e' ? cycle4LegacyAxes : program2025Axes[grade]
}

export function programForSchoolGrade2026_2027(grade: SchoolGrade): SchoolProgramApplicability {
  const match = schoolProgramApplicability2026_2027.find((item) => item.grade === grade)
  if (!match) throw new Error(`Missing school program applicability for ${grade}`)
  return match
}

export function targetForSchoolPack2026_2027(grade: SchoolGrade, track: PackTrack): SchoolTargetDescriptor {
  if ((grade === '4e' || grade === '3e') && track !== 'LVC') {
    return {
      grade,
      track,
      program_id: 'BO2020-MENE2018714A',
      scope: 'cycle-end',
      official_label: track === 'LVA' ? 'A2 minimum en fin de cycle' : 'A2 dans au moins deux activités en fin de cycle',
      operational_target: 'A2',
      note_fr: track === 'LVA'
        ? 'Le programme 2020 vise au moins A2 dans les cinq activités en fin de cycle et permet B1 dans plusieurs activités.'
        : 'Le programme 2020 vise A2 dans au moins deux activités langagières en fin de cycle.'
    }
  }

  const target = newTargets[grade][track]
  if (!target) throw new Error(`Track ${track} is not defined for ${grade} in the 2026-2027 school snapshot`)

  return {
    grade,
    track,
    program_id: 'BO2025-MENE2504621A',
    scope: 'grade-end',
    official_label: target.label,
    operational_target: target.target,
    note_fr: grade === 'terminale' && track === 'LVC'
      ? 'Le tableau officiel indique A2+ / B1 ; le moteur conserve A2+ comme borne opérationnelle prudente et l’interface doit afficher le libellé officiel complet.'
      : undefined
  }
}

const lvaLvbGradeChain: SchoolGrade[] = ['6e', '5e', '4e', '3e', 'seconde', 'premiere', 'terminale']
const lvcGradeChain: SchoolGrade[] = ['seconde', 'premiere', 'terminale']

function packId(grade: SchoolGrade, track: PackTrack): string {
  return `fr-es-school-2026-2027-${grade}-${track.toLowerCase()}`
}

function themesForGrade(grade: SchoolGrade): CanonicalThemeId[] {
  return [...new Set(axesForSchoolGrade2026_2027(grade).flatMap((item) => item.canonical_theme_ids))]
}

function sourcesForGrade(grade: SchoolGrade): string[] {
  if (grade === '4e' || grade === '3e') {
    return [schoolReferenceSources.bo2020, schoolReferenceSources.cycle4Legacy2020, schoolReferenceSources.eduscolCollege2026]
  }
  if (grade === '6e' || grade === '5e') {
    return [schoolReferenceSources.bo2025, schoolReferenceSources.spanishCollege2025, schoolReferenceSources.eduscolCollege2026]
  }
  return [schoolReferenceSources.bo2025, schoolReferenceSources.spanishLycee2025]
}

function buildPack(grade: SchoolGrade, track: PackTrack, previousGrade?: SchoolGrade): LearningPack {
  const applicability = programForSchoolGrade2026_2027(grade)
  const target = targetForSchoolPack2026_2027(grade, track)

  return {
    pack_id: packId(grade, track),
    pack_version: '2026.09-pack3-r1',
    audience: 'school',
    language_pair: 'fr-es',
    framework: 'France-LVE',
    framework_version: applicability.program_id,
    school_year: '2026-2027',
    grade,
    track,
    cefr_target: target.operational_target,
    inherits_from: previousGrade ? [packId(previousGrade, track)] : [],
    themes: themesForGrade(grade),
    entries: [],
    sources: sourcesForGrade(grade),
    status: 'draft',
    human_review: 'NOT_EXECUTED'
  }
}

function buildTrackChain(track: PackTrack, grades: SchoolGrade[]): LearningPack[] {
  return grades.map((grade, index) => buildPack(grade, track, grades[index - 1]))
}

export const schoolPacks2026_2027: LearningPack[] = [
  ...buildTrackChain('LVA', lvaLvbGradeChain),
  ...buildTrackChain('LVB', lvaLvbGradeChain),
  ...buildTrackChain('LVC', lvcGradeChain)
]

export const schoolTargets2026_2027: SchoolTargetDescriptor[] = schoolPacks2026_2027.map((pack) =>
  targetForSchoolPack2026_2027(pack.grade as SchoolGrade, pack.track as PackTrack)
)

export function schoolPack2026_2027(grade: SchoolGrade, track: PackTrack): LearningPack | undefined {
  return schoolPacks2026_2027.find((pack) => pack.grade === grade && pack.track === track)
}
