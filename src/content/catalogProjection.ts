import type { EditorialLexicalRow } from './editorialIntake'
import type { PackTrack } from './packs'
import type { CanonicalThemeId } from './taxonomy'

export type ProjectionSchoolGrade = '6e' | '5e' | '4e' | '3e' | 'seconde' | 'premiere' | 'terminale'

export interface CatalogSchoolSourceAssignment {
  review_id: string
  entry_id: string
  track: PackTrack
  grade: ProjectionSchoolGrade
  theme: CanonicalThemeId
}

export interface CatalogThemePathAssignment {
  entry_id: string
  path_id: string
  cefr_level: string
  theme: CanonicalThemeId
}

export interface CatalogProjectionSource {
  artifact: string
  sha256?: string
}

export interface CatalogProjectionDocument {
  schema_version: '1.0'
  catalog_id: string
  catalog_version: string
  source: CatalogProjectionSource
  school_source_assignments: CatalogSchoolSourceAssignment[]
  theme_path_assignments: CatalogThemePathAssignment[]
  source_counts: {
    school: Record<string, number>
    theme_paths: Record<string, number>
  }
}

export interface CatalogProjectionValidationResult {
  valid: boolean
  errors: string[]
}

export interface MaterializedSchoolAssignment {
  entry_id: string
  track: PackTrack
  grade: ProjectionSchoolGrade
  theme: CanonicalThemeId
  source_review_ids: string[]
}

export interface CatalogProjectionBuildOptions {
  catalogId: string
  catalogVersion: string
  source: CatalogProjectionSource
  allowedThemes: ReadonlySet<string>
  themePathAssignments?: readonly CatalogThemePathAssignment[]
}

export interface CatalogProjectionBuildResult extends CatalogProjectionValidationResult {
  projection?: CatalogProjectionDocument
}

const schoolGrades = new Set<ProjectionSchoolGrade>(['6e', '5e', '4e', '3e', 'seconde', 'premiere', 'terminale'])
const schoolTracks = new Set<PackTrack>(['LVA', 'LVB', 'LVC'])

function scalar(value: string | undefined): string {
  return (value ?? '').normalize('NFC').trim()
}

function sortedCounts(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)))
}

function sameCounts(left: Record<string, number>, right: Record<string, number>): boolean {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key])
}

function schoolCountKey(track: PackTrack, grade: ProjectionSchoolGrade): string {
  return `${track}:${grade}`
}

function themePathCountKey(pathId: string, cefrLevel: string): string {
  return `${pathId}:${cefrLevel}`
}

function asGrade(value: string): ProjectionSchoolGrade | undefined {
  return schoolGrades.has(value as ProjectionSchoolGrade) ? value as ProjectionSchoolGrade : undefined
}

function schoolFields(row: EditorialLexicalRow): Array<{ track: PackTrack; value: string }> {
  return [
    { track: 'LVA', value: scalar(row.school_lva) },
    { track: 'LVB', value: scalar(row.school_lvb) }
  ].filter((item) => item.value.length > 0)
}

/**
 * Converts exact, already-reviewed school classifications into a projection
 * document. It normalizes syntax only; it never infers or reclassifies a row.
 */
export function buildCatalogProjectionFromEditorialRows(
  rows: readonly EditorialLexicalRow[],
  reviewToEntryId: ReadonlyMap<string, string>,
  options: CatalogProjectionBuildOptions
): CatalogProjectionBuildResult {
  const errors: string[] = []
  const assignments: CatalogSchoolSourceAssignment[] = []
  const reviewTrackKeys = new Set<string>()

  for (const [index, row] of rows.entries()) {
    const reviewId = scalar(row.review_id)
    const fields = schoolFields(row)
    if (fields.length === 0) continue

    const entryId = reviewToEntryId.get(reviewId)
    if (!entryId) {
      errors.push(`row:${index}:school-entry-id-unresolved:${reviewId || '<missing>'}`)
      continue
    }

    const theme = scalar(row.theme)
    if (!options.allowedThemes.has(theme)) {
      errors.push(`row:${index}:school-unknown-theme:${theme || '<missing>'}`)
      continue
    }

    for (const field of fields) {
      const grade = asGrade(field.value)
      if (!grade) {
        errors.push(`row:${index}:school-invalid-grade:${field.track}:${field.value}`)
        continue
      }
      const sourceKey = `${reviewId}:${field.track}`
      if (reviewTrackKeys.has(sourceKey)) errors.push(`row:${index}:duplicate-school-source-assignment:${sourceKey}`)
      reviewTrackKeys.add(sourceKey)
      assignments.push({
        review_id: reviewId,
        entry_id: entryId,
        track: field.track,
        grade,
        theme: theme as CanonicalThemeId
      })
    }
  }

  const themePathAssignments = [...(options.themePathAssignments ?? [])]
  const projection: CatalogProjectionDocument = {
    schema_version: '1.0',
    catalog_id: scalar(options.catalogId),
    catalog_version: scalar(options.catalogVersion),
    source: {
      artifact: scalar(options.source.artifact),
      ...(scalar(options.source.sha256) ? { sha256: scalar(options.source.sha256) } : {})
    },
    school_source_assignments: assignments,
    theme_path_assignments: themePathAssignments,
    source_counts: {
      school: sortedCounts(assignments.map((assignment) => schoolCountKey(assignment.track, assignment.grade))),
      theme_paths: sortedCounts(themePathAssignments.map((assignment) => themePathCountKey(assignment.path_id, assignment.cefr_level)))
    }
  }

  const validation = validateCatalogProjection(projection, new Set(reviewToEntryId.values()), options.allowedThemes)
  errors.push(...validation.errors)
  const uniqueErrors = [...new Set(errors)]
  return uniqueErrors.length === 0
    ? { valid: true, errors: [], projection }
    : { valid: false, errors: uniqueErrors }
}

export function materializeSchoolAssignments(document: CatalogProjectionDocument): MaterializedSchoolAssignment[] {
  const materialized = new Map<string, MaterializedSchoolAssignment>()
  for (const source of document.school_source_assignments) {
    const key = `${source.track}:${source.grade}:${source.entry_id}`
    const existing = materialized.get(key)
    if (!existing) {
      materialized.set(key, {
        entry_id: source.entry_id,
        track: source.track,
        grade: source.grade,
        theme: source.theme,
        source_review_ids: [source.review_id]
      })
      continue
    }
    if (!existing.source_review_ids.includes(source.review_id)) existing.source_review_ids.push(source.review_id)
  }
  return [...materialized.values()]
}

export function validateCatalogProjection(
  document: CatalogProjectionDocument,
  canonicalEntryIds: ReadonlySet<string>,
  allowedThemes: ReadonlySet<string>
): CatalogProjectionValidationResult {
  const errors: string[] = []
  if (document.schema_version !== '1.0') errors.push(`schema-version:${document.schema_version}`)
  if (!scalar(document.catalog_id)) errors.push('missing-catalog-id')
  if (!scalar(document.catalog_version)) errors.push('missing-catalog-version')
  if (!scalar(document.source.artifact)) errors.push('missing-source-artifact')
  if (document.source.sha256 !== undefined && !/^[0-9a-f]{64}$/u.test(document.source.sha256)) errors.push('invalid-source-sha256')

  const sourceKeys = new Set<string>()
  const relationThemes = new Map<string, string>()
  for (const assignment of document.school_source_assignments) {
    if (!scalar(assignment.review_id)) errors.push('school-missing-review-id')
    if (!canonicalEntryIds.has(assignment.entry_id)) errors.push(`school-unknown-entry:${assignment.entry_id}`)
    if (!schoolTracks.has(assignment.track)) errors.push(`school-invalid-track:${String(assignment.track)}`)
    if (!schoolGrades.has(assignment.grade)) errors.push(`school-invalid-grade:${String(assignment.grade)}`)
    if (!allowedThemes.has(assignment.theme)) errors.push(`school-unknown-theme:${assignment.theme}`)

    const sourceKey = `${assignment.review_id}:${assignment.track}`
    if (sourceKeys.has(sourceKey)) errors.push(`duplicate-school-source-assignment:${sourceKey}`)
    sourceKeys.add(sourceKey)

    const relationKey = `${assignment.track}:${assignment.grade}:${assignment.entry_id}`
    const previousTheme = relationThemes.get(relationKey)
    if (previousTheme && previousTheme !== assignment.theme) errors.push(`school-conflicting-theme:${relationKey}`)
    else relationThemes.set(relationKey, assignment.theme)
  }

  const themePathKeys = new Set<string>()
  for (const assignment of document.theme_path_assignments) {
    if (!canonicalEntryIds.has(assignment.entry_id)) errors.push(`theme-path-unknown-entry:${assignment.entry_id}`)
    if (!scalar(assignment.path_id)) errors.push('theme-path-missing-id')
    if (!scalar(assignment.cefr_level)) errors.push(`theme-path-missing-cefr:${assignment.path_id}`)
    if (!allowedThemes.has(assignment.theme)) errors.push(`theme-path-unknown-theme:${assignment.theme}`)
    const key = `${assignment.path_id}:${assignment.cefr_level}:${assignment.entry_id}`
    if (themePathKeys.has(key)) errors.push(`duplicate-theme-path-assignment:${key}`)
    themePathKeys.add(key)
  }

  const actualSchoolCounts = sortedCounts(document.school_source_assignments.map((assignment) => schoolCountKey(assignment.track, assignment.grade)))
  if (!sameCounts(actualSchoolCounts, document.source_counts.school)) errors.push('school-source-count-mismatch')
  const actualThemePathCounts = sortedCounts(document.theme_path_assignments.map((assignment) => themePathCountKey(assignment.path_id, assignment.cefr_level)))
  if (!sameCounts(actualThemePathCounts, document.source_counts.theme_paths)) errors.push('theme-path-source-count-mismatch')

  return { valid: errors.length === 0, errors: [...new Set(errors)] }
}
