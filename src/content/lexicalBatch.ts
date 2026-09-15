import { validateLexicalEntry } from './contracts'
import { canonicalThemeIds, type CanonicalThemeId } from './taxonomy'

export const REVERSOLINGUO_LEXICAL_UUID_NAMESPACE = '34e33fa1-c411-4168-8e5d-107cf91361cb'

export interface BatchProvenance {
  source: string
  license: string
  authored_by: string
}

export interface LexicalSenseInput {
  sense_id: string
  translations: string[]
  example_source: string
  example_target: string
  note?: string
}

export interface LexicalBatchEntryInput {
  entry_id?: string
  lemma: string
  part_of_speech: 'noun' | 'verb' | 'adjective' | 'adverb' | 'expression' | 'connector' | 'other'
  gender?: 'masculine' | 'feminine' | 'common' | 'not_applicable'
  article?: string
  senses: LexicalSenseInput[]
  cefr_rationale: string
  themes: string[]
  variety?: string
  provenance?: Partial<BatchProvenance>
}

export interface LexicalBatchInput {
  batch_id: string
  source_language: string
  target_language: string
  cefr_level: 'PRE-A1' | 'A1' | 'A2' | 'B1' | 'B2'
  provenance: BatchProvenance
  entries: LexicalBatchEntryInput[]
}

export interface ExistingLexicalIdentity {
  entry_id: string
  language_tag: string
  lemma: string
}

export interface PreparedLexicalEntry {
  entry_id: string
  language_tag: string
  lemma: string
  part_of_speech: LexicalBatchEntryInput['part_of_speech']
  gender?: LexicalBatchEntryInput['gender']
  article?: string
  senses: LexicalSenseInput[]
  cefr_level: LexicalBatchInput['cefr_level']
  cefr_rationale: string
  themes: string[]
  variety?: string
  provenance: BatchProvenance
  status: 'draft'
  version: 1
}

export interface LexicalBatchPreparationResult {
  valid: boolean
  errors: string[]
  entries: PreparedLexicalEntry[]
  batch_id: string
}

export interface LexicalBatchOptions {
  existingEntries?: readonly ExistingLexicalIdentity[]
  allowedThemes?: ReadonlySet<string>
  expectedLicense?: string
  namespaceUuid?: string
  subtle?: SubtleCrypto
}

function normalizeScalar(value: string): string {
  return value.normalize('NFC').trim()
}

function normalizeOptional(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  return normalizeScalar(value)
}

function semanticKey(languageTag: string, lemma: string): string {
  return `${normalizeScalar(languageTag).toLowerCase()}:${normalizeScalar(lemma).toLowerCase()}`
}

function uuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replaceAll('-', '')
  if (!/^[0-9a-f]{32}$/iu.test(hex)) throw new Error(`invalid-uuid-namespace:${uuid}`)
  return Uint8Array.from(hex.match(/.{2}/gu) ?? [], (byte) => Number.parseInt(byte, 16))
}

function formatUuid(bytes: Uint8Array): string {
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/** Standard UUID v5 (SHA-1 namespace/name), exposed for reproducible editorial tooling. */
export async function uuidV5(
  namespaceUuid: string,
  name: string,
  subtle: SubtleCrypto = globalThis.crypto.subtle
): Promise<string> {
  const namespace = uuidBytes(namespaceUuid)
  const nameBytes = new TextEncoder().encode(name)
  const payload = new Uint8Array(namespace.length + nameBytes.length)
  payload.set(namespace)
  payload.set(nameBytes, namespace.length)
  const digest = new Uint8Array(await subtle.digest('SHA-1', payload))
  const bytes = digest.slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return formatUuid(bytes)
}

export function lexicalIdentityName(sourceLanguage: string, targetLanguage: string, lemma: string): string {
  return [
    'reversolinguo-lexical-v1',
    normalizeScalar(sourceLanguage).toLowerCase(),
    normalizeScalar(targetLanguage).toLowerCase(),
    normalizeScalar(lemma).toLowerCase()
  ].join('|')
}

export async function stableLexicalUuid(
  sourceLanguage: string,
  targetLanguage: string,
  lemma: string,
  subtle: SubtleCrypto = globalThis.crypto.subtle,
  namespaceUuid: string = REVERSOLINGUO_LEXICAL_UUID_NAMESPACE
): Promise<string> {
  return uuidV5(namespaceUuid, lexicalIdentityName(sourceLanguage, targetLanguage, lemma), subtle)
}

function normalizeSense(sense: LexicalSenseInput): LexicalSenseInput {
  return {
    sense_id: normalizeScalar(sense.sense_id),
    translations: sense.translations.map(normalizeScalar),
    example_source: normalizeScalar(sense.example_source),
    example_target: normalizeScalar(sense.example_target),
    ...(sense.note === undefined ? {} : { note: normalizeScalar(sense.note) })
  }
}

function provenanceFor(batch: LexicalBatchInput, entry: LexicalBatchEntryInput): BatchProvenance {
  return {
    source: normalizeScalar(entry.provenance?.source ?? batch.provenance.source),
    license: normalizeScalar(entry.provenance?.license ?? batch.provenance.license),
    authored_by: normalizeScalar(entry.provenance?.authored_by ?? batch.provenance.authored_by)
  }
}

function normalizeEntry(
  batch: LexicalBatchInput,
  input: LexicalBatchEntryInput,
  entryId: string
): PreparedLexicalEntry {
  return {
    entry_id: entryId,
    language_tag: normalizeScalar(batch.source_language),
    lemma: normalizeScalar(input.lemma),
    part_of_speech: input.part_of_speech,
    ...(input.gender === undefined ? {} : { gender: input.gender }),
    ...(input.article === undefined ? {} : { article: normalizeScalar(input.article) }),
    senses: input.senses.map(normalizeSense),
    cefr_level: batch.cefr_level,
    cefr_rationale: normalizeScalar(input.cefr_rationale),
    themes: input.themes.map(normalizeScalar),
    ...(input.variety === undefined ? {} : { variety: normalizeOptional(input.variety) }),
    provenance: provenanceFor(batch, input),
    status: 'draft',
    version: 1
  }
}

function batchMetadataErrors(batch: LexicalBatchInput): string[] {
  const errors: string[] = []
  if (!normalizeScalar(batch.batch_id)) errors.push('missing-batch-id')
  if (!normalizeScalar(batch.source_language)) errors.push('missing-source-language')
  if (!normalizeScalar(batch.target_language)) errors.push('missing-target-language')
  if (!normalizeScalar(batch.provenance.source)) errors.push('missing-batch-provenance-source')
  if (!normalizeScalar(batch.provenance.license)) errors.push('missing-batch-license')
  if (!normalizeScalar(batch.provenance.authored_by)) errors.push('missing-batch-author')
  if (batch.entries.length === 0) errors.push('empty-batch')
  return errors
}

/**
 * Prepares a complete editorial batch. Fail-closed: if one issue exists,
 * `entries` is empty, so callers cannot accidentally promote a valid subset.
 */
export async function prepareLexicalBatch(
  batch: LexicalBatchInput,
  options: LexicalBatchOptions = {}
): Promise<LexicalBatchPreparationResult> {
  const errors = batchMetadataErrors(batch)
  const allowedThemes = options.allowedThemes ?? canonicalThemeIds
  const existingEntries = options.existingEntries ?? []
  const existingIds = new Set(existingEntries.map((entry) => entry.entry_id))
  const existingSemanticKeys = new Set(existingEntries.map((entry) => semanticKey(entry.language_tag, entry.lemma)))
  const batchIds = new Set<string>()
  const batchSemanticKeys = new Set<string>()
  const prepared: PreparedLexicalEntry[] = []
  const subtle = options.subtle ?? globalThis.crypto.subtle
  const namespaceUuid = options.namespaceUuid ?? REVERSOLINGUO_LEXICAL_UUID_NAMESPACE

  const identities = batch.entries.map((entry) => lexicalIdentityName(batch.source_language, batch.target_language, entry.lemma))
  const generatedIds = await Promise.all(identities.map((identity) => uuidV5(namespaceUuid, identity, subtle)))

  for (const [index, input] of batch.entries.entries()) {
    const prefix = `entry:${index}`
    const generatedId = generatedIds[index]
    if (input.entry_id !== undefined && input.entry_id !== generatedId) {
      errors.push(`${prefix}:provided-id-mismatch`)
    }

    const entry = normalizeEntry(batch, input, generatedId)
    const key = semanticKey(entry.language_tag, entry.lemma)

    if (batchIds.has(entry.entry_id)) errors.push(`${prefix}:duplicate-batch-id:${entry.entry_id}`)
    batchIds.add(entry.entry_id)
    if (existingIds.has(entry.entry_id)) errors.push(`${prefix}:existing-id:${entry.entry_id}`)

    if (batchSemanticKeys.has(key)) errors.push(`${prefix}:duplicate-batch-semantic:${key}`)
    batchSemanticKeys.add(key)
    if (existingSemanticKeys.has(key)) errors.push(`${prefix}:existing-semantic:${key}`)

    for (const theme of entry.themes) {
      if (!allowedThemes.has(theme)) errors.push(`${prefix}:unknown-theme:${theme}`)
    }

    if (options.expectedLicense !== undefined && entry.provenance.license !== options.expectedLicense) {
      errors.push(`${prefix}:unexpected-license:${entry.provenance.license}`)
    }

    const schema = validateLexicalEntry(entry)
    if (!schema.valid) {
      const paths = schema.errors.map((error) => `${error.instancePath || '/'}:${error.keyword}`).join(',')
      errors.push(`${prefix}:schema:${paths}`)
    }

    prepared.push(entry)
  }

  const uniqueErrors = [...new Set(errors)]
  return {
    valid: uniqueErrors.length === 0,
    errors: uniqueErrors,
    entries: uniqueErrors.length === 0 ? prepared : [],
    batch_id: normalizeScalar(batch.batch_id)
  }
}

export function isCanonicalTheme(value: string): value is CanonicalThemeId {
  return canonicalThemeIds.has(value as CanonicalThemeId)
}
