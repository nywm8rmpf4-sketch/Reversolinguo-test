import {
  prepareLexicalBatch,
  type ExistingLexicalIdentity,
  type LexicalBatchEntryInput,
  type PreparedLexicalEntry
} from './lexicalBatch'
import { canonicalThemeIds } from './taxonomy'

export type EditorialCefrLevel = 'A1' | 'A2' | 'B1' | 'B2'

export interface EditorialLexicalRow {
  review_id: string
  spanish: string
  french: string
  sense_key?: string
  type: string
  theme: string
  subtheme?: string
  relation?: string
  rationale: string
  cefr_level: EditorialCefrLevel
  school_lva?: string
  school_lvb?: string
  reversolinguo_sublevel?: string
  intra_cefr_index?: number
  confidence_lva?: string
  confidence_lvb?: string
  review_status: string
  note?: string
  source_url?: string
}

export interface EditorialEnrichment {
  review_id: string
  example_source: string
  example_target: string
  note?: string
  variety?: string
}

export interface EditorialExistingMatch {
  review_id: string
  entry_id: string
  lemma: string
}

export interface EditorialReconciliationResult {
  valid: boolean
  errors: string[]
  existing_matches: EditorialExistingMatch[]
  new_rows: EditorialLexicalRow[]
}

export interface EditorialCorpusPreparationResult {
  valid: boolean
  ready_for_semantic_review: boolean
  errors: string[]
  existing_matches: EditorialExistingMatch[]
  entries_by_level: Record<EditorialCefrLevel, PreparedLexicalEntry[]>
}

const editorialTypeMap: Readonly<Record<string, LexicalBatchEntryInput['part_of_speech']>> = {
  nom: 'noun',
  verbe: 'verb',
  adjectif: 'adjective',
  adverbe: 'adverb',
  expression: 'expression',
  formule: 'expression',
  locution: 'expression',
  interjection: 'expression',
  conjonction: 'connector',
  connecteur: 'connector',
  préposition: 'other',
  preposition: 'other',
  pronom: 'other',
  déterminant: 'other',
  determinant: 'other',
  article: 'other',
  numéral: 'other',
  numeral: 'other',
  nombre: 'other',
  autre: 'other'
}

function normalizeScalar(value: string): string {
  return value.normalize('NFC').trim()
}

function normalizedKey(value: string): string {
  return normalizeScalar(value).toLocaleLowerCase('es')
}

function semanticKey(languageTag: string, lemma: string, senseKey?: string): string {
  const base = `${normalizedKey(languageTag)}:${normalizedKey(lemma)}`
  const normalizedSense = normalizeScalar(senseKey ?? '').toLocaleLowerCase('es')
  return normalizedSense ? `${base}:sense:${normalizedSense}` : base
}

function emptyEntriesByLevel(): Record<EditorialCefrLevel, PreparedLexicalEntry[]> {
  return { A1: [], A2: [], B1: [], B2: [] }
}

export function editorialPartOfSpeech(value: string): LexicalBatchEntryInput['part_of_speech'] | undefined {
  return editorialTypeMap[normalizedKey(value)]
}

/**
 * Conservative translation parsing: semicolons in the editorial matrix mean
 * explicit alternatives. Slashes are preserved because they can encode a
 * nuance that must not be split automatically into distinct senses.
 */
export function editorialTranslations(value: string): string[] {
  return [...new Set(value.split(';').map(normalizeScalar).filter(Boolean))]
}

export function editorialStatusNeedsArbitration(status: string): boolean {
  const normalized = normalizedKey(status)
  return normalized.includes('arbitrage') || normalized.includes('moderniser')
}

export function reconcileEditorialRows(
  rows: readonly EditorialLexicalRow[],
  canonicalEntries: readonly ExistingLexicalIdentity[]
): EditorialReconciliationResult {
  const errors: string[] = []
  const existingMatches: EditorialExistingMatch[] = []
  const newRows: EditorialLexicalRow[] = []
  const reviewIds = new Set<string>()
  const sourceSemanticKeys = new Set<string>()
  const canonicalBySemantic = new Map<string, ExistingLexicalIdentity>()

  for (const entry of canonicalEntries) {
    const key = semanticKey(entry.language_tag, entry.lemma, entry.sense_key)
    if (canonicalBySemantic.has(key)) errors.push(`canonical-duplicate-semantic:${key}`)
    canonicalBySemantic.set(key, entry)
  }

  for (const [index, row] of rows.entries()) {
    const prefix = `row:${index}`
    const reviewId = normalizeScalar(row.review_id)
    const lemma = normalizeScalar(row.spanish)

    if (!reviewId) errors.push(`${prefix}:missing-review-id`)
    if (reviewIds.has(reviewId)) errors.push(`${prefix}:duplicate-review-id:${reviewId}`)
    reviewIds.add(reviewId)

    if (!lemma) errors.push(`${prefix}:missing-spanish`)
    if (!normalizeScalar(row.french)) errors.push(`${prefix}:missing-french`)
    if (!normalizeScalar(row.rationale)) errors.push(`${prefix}:missing-rationale`)
    if (!normalizeScalar(row.review_status)) errors.push(`${prefix}:missing-review-status`)

    const key = semanticKey('es', lemma, row.sense_key)
    if (sourceSemanticKeys.has(key)) errors.push(`${prefix}:duplicate-editorial-semantic:${key}`)
    sourceSemanticKeys.add(key)

    const existing = canonicalBySemantic.get(key)
    if (existing) {
      existingMatches.push({ review_id: reviewId, entry_id: existing.entry_id, lemma: existing.lemma })
      continue
    }

    if (normalizedKey(row.review_status).includes('certifi')) {
      errors.push(`${prefix}:certified-row-missing-from-canonical:${reviewId}`)
      continue
    }

    newRows.push({
      ...row,
      review_id: reviewId,
      spanish: lemma,
      french: normalizeScalar(row.french),
      ...(row.sense_key === undefined ? {} : { sense_key: normalizeScalar(row.sense_key).toLowerCase() }),
      type: normalizeScalar(row.type),
      theme: normalizeScalar(row.theme),
      rationale: normalizeScalar(row.rationale),
      review_status: normalizeScalar(row.review_status),
      ...(row.note === undefined ? {} : { note: normalizeScalar(row.note) }),
      ...(row.source_url === undefined ? {} : { source_url: normalizeScalar(row.source_url) })
    })
  }

  const uniqueErrors = [...new Set(errors)]
  return {
    valid: uniqueErrors.length === 0,
    errors: uniqueErrors,
    existing_matches: existingMatches,
    new_rows: uniqueErrors.length === 0 ? newRows : []
  }
}

function rowPreparationErrors(row: EditorialLexicalRow, enrichment: EditorialEnrichment | undefined): string[] {
  const errors: string[] = []
  const prefix = `review:${row.review_id}`

  if (editorialStatusNeedsArbitration(row.review_status)) {
    errors.push(`${prefix}:unresolved-editorial-status:${row.review_status}`)
  }
  if (!editorialPartOfSpeech(row.type)) errors.push(`${prefix}:unsupported-type:${row.type}`)
  if (!canonicalThemeIds.has(row.theme as never)) errors.push(`${prefix}:unknown-theme:${row.theme}`)
  if (!enrichment) {
    errors.push(`${prefix}:missing-enrichment`)
  } else {
    if (!normalizeScalar(enrichment.example_source)) errors.push(`${prefix}:missing-example-source`)
    if (!normalizeScalar(enrichment.example_target)) errors.push(`${prefix}:missing-example-target`)
  }
  if (editorialTranslations(row.french).length === 0) errors.push(`${prefix}:missing-translation`)
  return errors
}

function lexicalInputFor(row: EditorialLexicalRow, enrichment: EditorialEnrichment): LexicalBatchEntryInput {
  const partOfSpeech = editorialPartOfSpeech(row.type)
  if (!partOfSpeech) throw new Error(`unsupported editorial type after validation: ${row.type}`)

  const editorialNote = normalizeScalar(row.note ?? '')
  const enrichmentNote = normalizeScalar(enrichment.note ?? '')
  const note = [editorialNote, enrichmentNote].filter(Boolean).join(' — ')

  return {
    lemma: normalizeScalar(row.spanish),
    ...(row.sense_key === undefined ? {} : { sense_key: normalizeScalar(row.sense_key).toLowerCase() }),
    part_of_speech: partOfSpeech,
    senses: [{
      sense_id: 's1',
      translations: editorialTranslations(row.french),
      example_source: normalizeScalar(enrichment.example_source),
      example_target: normalizeScalar(enrichment.example_target),
      ...(note ? { note } : {})
    }],
    cefr_rationale: normalizeScalar(row.rationale),
    themes: [normalizeScalar(row.theme)],
    ...(normalizeScalar(enrichment.variety ?? '') ? { variety: normalizeScalar(enrichment.variety ?? '') } : {})
  }
}

/**
 * Converts a complete reviewed editorial corpus into ADR-024 draft objects.
 * The operation is globally fail-closed: one unresolved arbitration, missing
 * example, duplicate, unsupported type or pipeline error empties every level.
 * Existing canonical lemmas are reconciled and never regenerated.
 */
export async function prepareEditorialCorpus(
  rows: readonly EditorialLexicalRow[],
  enrichments: readonly EditorialEnrichment[],
  canonicalEntries: readonly ExistingLexicalIdentity[],
  options: { subtle?: SubtleCrypto; archiveId?: string } = {}
): Promise<EditorialCorpusPreparationResult> {
  const reconciliation = reconcileEditorialRows(rows, canonicalEntries)
  const entriesByLevel = emptyEntriesByLevel()
  if (!reconciliation.valid) {
    return {
      valid: false,
      ready_for_semantic_review: false,
      errors: reconciliation.errors,
      existing_matches: reconciliation.existing_matches,
      entries_by_level: entriesByLevel
    }
  }

  const errors: string[] = []
  const enrichmentByReviewId = new Map<string, EditorialEnrichment>()
  for (const enrichment of enrichments) {
    const reviewId = normalizeScalar(enrichment.review_id)
    if (enrichmentByReviewId.has(reviewId)) errors.push(`duplicate-enrichment:${reviewId}`)
    enrichmentByReviewId.set(reviewId, enrichment)
  }

  for (const row of reconciliation.new_rows) {
    errors.push(...rowPreparationErrors(row, enrichmentByReviewId.get(row.review_id)))
  }

  if (errors.length > 0) {
    return {
      valid: false,
      ready_for_semantic_review: false,
      errors: [...new Set(errors)],
      existing_matches: reconciliation.existing_matches,
      entries_by_level: entriesByLevel
    }
  }

  const existingIdentities = canonicalEntries.map((entry) => ({
    entry_id: entry.entry_id,
    language_tag: entry.language_tag,
    lemma: entry.lemma,
    ...(entry.sense_key === undefined ? {} : { sense_key: entry.sense_key })
  }))
  const archiveId = normalizeScalar(options.archiveId ?? 'fr-es-editorial-archive')
  const levels: EditorialCefrLevel[] = ['A1', 'A2', 'B1', 'B2']

  for (const level of levels) {
    const levelRows = reconciliation.new_rows.filter((row) => row.cefr_level === level)
    if (levelRows.length === 0) continue

    const result = await prepareLexicalBatch({
      batch_id: `${archiveId}-${level.toLowerCase()}`,
      source_language: 'es',
      target_language: 'fr',
      cefr_level: level,
      provenance: {
        source: `Reversolinguo editorial archive ${archiveId}; external references are used only for CEFR/domain framing`,
        license: 'CC BY 4.0',
        authored_by: 'Reversolinguo project editorial draft'
      },
      entries: levelRows.map((row) => lexicalInputFor(row, enrichmentByReviewId.get(row.review_id)!))
    }, {
      existingEntries: existingIdentities,
      expectedLicense: 'CC BY 4.0',
      ...(options.subtle === undefined ? {} : { subtle: options.subtle })
    })

    if (!result.valid) errors.push(...result.errors.map((error) => `level:${level}:${error}`))
    else entriesByLevel[level] = result.entries
  }

  if (errors.length > 0) {
    return {
      valid: false,
      ready_for_semantic_review: false,
      errors: [...new Set(errors)],
      existing_matches: reconciliation.existing_matches,
      entries_by_level: emptyEntriesByLevel()
    }
  }

  return {
    valid: true,
    ready_for_semantic_review: true,
    errors: [],
    existing_matches: reconciliation.existing_matches,
    entries_by_level: entriesByLevel
  }
}
