import Ajv, { type ErrorObject } from 'ajv'
import addFormats from 'ajv-formats'
import lexicalEntrySchema from './schemas/lexical-entry.schema.json'
import catalogManifestSchema from './schemas/catalog-manifest.schema.json'
import learningPackSchema from './schemas/learning-pack.schema.json'
import progressExportSchema from './schemas/progress-export.schema.json'

const ajv = new Ajv({ allErrors: true, strict: true })
addFormats(ajv)

const lexicalValidator = ajv.compile(lexicalEntrySchema)
const catalogManifestValidator = ajv.compile(catalogManifestSchema)
const learningPackValidator = ajv.compile(learningPackSchema)
const progressValidator = ajv.compile(progressExportSchema)

export interface ValidationResult { valid: boolean; errors: ErrorObject[] }

export interface CatalogBundleResult {
  valid: boolean
  errors: string[]
}

function result(valid: boolean, errors?: ErrorObject[] | null): ValidationResult {
  return { valid, errors: errors ? [...errors] : [] }
}

export function validateLexicalEntry(value: unknown): ValidationResult {
  return result(lexicalValidator(value), lexicalValidator.errors)
}

export function validateCatalogManifest(value: unknown): ValidationResult {
  return result(catalogManifestValidator(value), catalogManifestValidator.errors)
}

export function validateLearningPack(value: unknown): ValidationResult {
  return result(learningPackValidator(value), learningPackValidator.errors)
}

export function validateProgressExport(value: unknown): ValidationResult {
  return result(progressValidator(value), progressValidator.errors)
}

export function validateCatalogBundle(entries: unknown[], manifest: unknown): CatalogBundleResult {
  const errors: string[] = []
  const manifestResult = validateCatalogManifest(manifest)
  if (!manifestResult.valid) errors.push('manifest-schema')

  const typedManifest = manifest as { source_language?: string; cefr_level?: string; entry_count?: number; license?: string }
  const ids = new Set<string>()
  const semanticKeys = new Set<string>()

  for (const [index, value] of entries.entries()) {
    const entryResult = validateLexicalEntry(value)
    if (!entryResult.valid) {
      errors.push(`entry-schema:${index}`)
      continue
    }
    const entry = value as {
      entry_id: string
      language_tag: string
      lemma: string
      sense_key?: string
      cefr_level: string
      provenance: { license: string }
    }
    if (ids.has(entry.entry_id)) errors.push(`duplicate-id:${entry.entry_id}`)
    ids.add(entry.entry_id)
    const baseSemanticKey = `${entry.language_tag}:${entry.lemma.normalize('NFC').trim().toLocaleLowerCase()}`
    const senseKey = entry.sense_key?.normalize('NFC').trim().toLocaleLowerCase()
    const semanticKey = senseKey ? `${baseSemanticKey}:sense:${senseKey}` : baseSemanticKey
    if (semanticKeys.has(semanticKey)) errors.push(`duplicate-semantic:${semanticKey}`)
    semanticKeys.add(semanticKey)
    if (typedManifest.source_language && entry.language_tag !== typedManifest.source_language) errors.push(`language-mismatch:${entry.entry_id}`)
    if (typedManifest.cefr_level) {
      const order = ['PRE-A1', 'A1', 'A2', 'B1', 'B2']
      const entryRank = order.indexOf(entry.cefr_level)
      const manifestRank = order.indexOf(typedManifest.cefr_level)
      if (entryRank < 0 || manifestRank < 0 || entryRank > manifestRank) errors.push(`level-above-manifest:${entry.entry_id}`)
    }
    if (typedManifest.license && entry.provenance.license !== typedManifest.license) errors.push(`license-mismatch:${entry.entry_id}`)
  }

  if (typedManifest.entry_count !== undefined && entries.length !== typedManifest.entry_count) errors.push('entry-count-mismatch')
  return { valid: errors.length === 0, errors }
}
