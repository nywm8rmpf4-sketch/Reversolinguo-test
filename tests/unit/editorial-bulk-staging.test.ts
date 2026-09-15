import { webcrypto } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateLexicalEntry } from '../../src/content/contracts'
import {
  prepareLexicalBatch,
  stableLexicalUuid,
  type ExistingLexicalIdentity,
  type LexicalBatchEntryInput,
  type PreparedLexicalEntry
} from '../../src/content/lexicalBatch'
import { canonicalThemeIds } from '../../src/content/taxonomy'

interface BulkManifest {
  schema_version: string
  validation_profile: string
  archive_id: string
  source_language: string
  target_language: string
  expected_license: string
  canonical_catalog: string
  policy: {
    exact_source_coverage: boolean
    cross_tranche_uniqueness: boolean
    deterministic_uuid: boolean
    slash_translation_requires_explicit_pair: boolean
    fail_closed: boolean
  }
  tranches: Array<{
    tranche_id: string
    cefr_level: 'PRE-A1' | 'A1' | 'A2' | 'B1' | 'B2'
    source_range: [string, string]
    source_map: string
    entry_files: string[]
    expected_included: number
    expected_excluded: number
    materializer_batch_id: string
  }>
}

interface SourceMapRow {
  review_id: string
  entry_id?: string
  lemma: string
  reason?: string
  canonical_entries?: Array<{ entry_id: string; lemma: string }>
}

interface SourceMap {
  archive_id: string
  tranche_id: string
  source_range: [string, string]
  included: SourceMapRow[]
  excluded: SourceMapRow[]
}

const subtle = webcrypto.subtle as unknown as SubtleCrypto
const root = process.cwd()

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8')) as T
}

const manifest = readJson<BulkManifest>('catalogs/fr-es/a1/drafts/staging-batches.manifest.json')
const canonicalEntries = readJson<PreparedLexicalEntry[]>(manifest.canonical_catalog)

function semanticKey(languageTag: string, lemma: string): string {
  return `${languageTag.normalize('NFC').trim().toLocaleLowerCase('es')}:${lemma.normalize('NFC').trim().toLocaleLowerCase('es')}`
}

function exactRange([start, end]: [string, string]): string[] {
  const startMatch = /^(.*?)(\d+)$/u.exec(start)
  const endMatch = /^(.*?)(\d+)$/u.exec(end)
  if (!startMatch || !endMatch || startMatch[1] !== endMatch[1] || startMatch[2].length !== endMatch[2].length) {
    throw new Error(`unsupported-source-range:${start}..${end}`)
  }
  const first = Number(startMatch[2])
  const last = Number(endMatch[2])
  if (!Number.isInteger(first) || !Number.isInteger(last) || last < first) {
    throw new Error(`invalid-source-range:${start}..${end}`)
  }
  return Array.from(
    { length: last - first + 1 },
    (_, index) => `${startMatch[1]}${String(first + index).padStart(startMatch[2].length, '0')}`
  )
}

function loadEntries(files: string[]): PreparedLexicalEntry[] {
  return files.flatMap((file) => readJson<PreparedLexicalEntry[]>(file))
}

function batchInput(entry: PreparedLexicalEntry): LexicalBatchEntryInput {
  return {
    lemma: entry.lemma,
    part_of_speech: entry.part_of_speech,
    ...(entry.gender === undefined ? {} : { gender: entry.gender }),
    ...(entry.article === undefined ? {} : { article: entry.article }),
    senses: entry.senses,
    cefr_rationale: entry.cefr_rationale,
    themes: entry.themes,
    ...(entry.variety === undefined ? {} : { variety: entry.variety }),
    provenance: entry.provenance
  }
}

describe('manifest-driven editorial bulk staging', () => {
  it('declares the fail-closed EDITORIAL_STAGING contract explicitly', () => {
    expect(manifest.schema_version).toBe('1.0')
    expect(manifest.validation_profile).toBe('EDITORIAL_STAGING')
    expect(manifest.source_language).toBe('es')
    expect(manifest.target_language).toBe('fr')
    expect(manifest.policy).toEqual({
      exact_source_coverage: true,
      cross_tranche_uniqueness: true,
      deterministic_uuid: true,
      slash_translation_requires_explicit_pair: true,
      fail_closed: true
    })
    expect(manifest.tranches.length).toBeGreaterThan(0)
  })

  it('accounts exactly for every declared source row and preserves explicit exclusions', () => {
    for (const tranche of manifest.tranches) {
      const sourceMap = readJson<SourceMap>(tranche.source_map)
      const entries = loadEntries(tranche.entry_files)

      expect(sourceMap.archive_id).toBe(manifest.archive_id)
      expect(sourceMap.tranche_id).toBe(tranche.tranche_id)
      expect(sourceMap.source_range).toEqual(tranche.source_range)
      expect(sourceMap.included).toHaveLength(tranche.expected_included)
      expect(sourceMap.excluded).toHaveLength(tranche.expected_excluded)
      expect(entries).toHaveLength(tranche.expected_included)

      const accounted = [...sourceMap.included, ...sourceMap.excluded].map((row) => row.review_id).sort()
      expect(accounted).toEqual(exactRange(tranche.source_range))

      const entriesById = new Map(entries.map((entry) => [entry.entry_id, entry]))
      expect(new Set(sourceMap.included.map((row) => row.entry_id))).toEqual(new Set(entriesById.keys()))
      for (const row of sourceMap.included) {
        const entry = entriesById.get(row.entry_id ?? '')
        expect(entry, `missing staged entry for ${row.review_id}`).toBeDefined()
        expect(entry?.lemma).toBe(row.lemma)
      }
      for (const row of sourceMap.excluded) {
        expect(row.reason?.trim(), `missing exclusion reason for ${row.review_id}`).not.toBe('')
      }
    }
  })

  it('validates all tranches with one lexical invariant set and no invented review provenance', () => {
    for (const tranche of manifest.tranches) {
      const entries = loadEntries(tranche.entry_files)
      for (const entry of entries) {
        const validation = validateLexicalEntry(entry)
        expect(validation.valid, `${tranche.tranche_id}/${entry.lemma}: ${JSON.stringify(validation.errors)}`).toBe(true)
        expect(entry.language_tag).toBe(manifest.source_language)
        expect(entry.cefr_level).toBe(tranche.cefr_level)
        expect(entry.status).toBe('draft')
        expect(entry.version).toBe(1)
        expect(entry.provenance.license).toBe(manifest.expected_license)
        expect(entry.provenance).not.toHaveProperty('reviewed_by')
        expect(entry.provenance).not.toHaveProperty('reviewed_at')
        expect(entry.senses.every((sense) => sense.example_source.trim() !== '' && sense.example_target.trim() !== '')).toBe(true)
        expect(entry.themes.every((theme) => canonicalThemeIds.has(theme as never))).toBe(true)

        if (manifest.policy.slash_translation_requires_explicit_pair) {
          for (const sense of entry.senses) {
            for (const translation of sense.translations) {
              if (!translation.includes(' / ')) continue
              expect(entry.lemma, `unexpected slash alternative in ${entry.lemma}: ${translation}`).toContain(' / ')
              expect(sense.note ?? '', `paired unit ${entry.lemma} must be explicitly documented`).toContain('paire lexicale')
            }
          }
        }
      }
    }
  })

  it('enforces deterministic UUIDs and uniqueness across canonical content and all staged tranches', async () => {
    const ids = new Set(canonicalEntries.map((entry) => entry.entry_id))
    const semantics = new Set(canonicalEntries.map((entry) => semanticKey(entry.language_tag, entry.lemma)))

    for (const tranche of manifest.tranches) {
      for (const entry of loadEntries(tranche.entry_files)) {
        expect(entry.entry_id).toBe(
          await stableLexicalUuid(manifest.source_language, manifest.target_language, entry.lemma, subtle)
        )
        expect(ids.has(entry.entry_id), `duplicate UUID ${entry.entry_id}`).toBe(false)
        expect(semantics.has(semanticKey(entry.language_tag, entry.lemma)), `duplicate semantic ${entry.lemma}`).toBe(false)
        ids.add(entry.entry_id)
        semantics.add(semanticKey(entry.language_tag, entry.lemma))
      }
    }
  })

  it('verifies every canonical reconciliation target declared by source maps', () => {
    const canonicalById = new Map(canonicalEntries.map((entry) => [entry.entry_id, entry]))
    for (const tranche of manifest.tranches) {
      const sourceMap = readJson<SourceMap>(tranche.source_map)
      for (const excluded of sourceMap.excluded) {
        for (const target of excluded.canonical_entries ?? []) {
          expect(canonicalById.get(target.entry_id)).toEqual(
            expect.objectContaining({ entry_id: target.entry_id, lemma: target.lemma })
          )
        }
      }
    }
  })

  it('reproduces every tranche exactly through ADR-025 while carrying prior tranches as collision references', async () => {
    const existing: ExistingLexicalIdentity[] = canonicalEntries.map((entry) => ({
      entry_id: entry.entry_id,
      language_tag: entry.language_tag,
      lemma: entry.lemma
    }))

    for (const tranche of manifest.tranches) {
      const entries = loadEntries(tranche.entry_files)
      const result = await prepareLexicalBatch({
        batch_id: tranche.materializer_batch_id,
        source_language: manifest.source_language,
        target_language: manifest.target_language,
        cefr_level: tranche.cefr_level,
        provenance: {
          source: `Reversolinguo editorial archive ${manifest.archive_id}; external references are used only for CEFR/domain framing`,
          license: manifest.expected_license,
          authored_by: 'Reversolinguo project editorial draft'
        },
        entries: entries.map(batchInput)
      }, {
        subtle,
        existingEntries: existing,
        expectedLicense: manifest.expected_license
      })

      expect(result.valid, `${tranche.tranche_id}: ${result.errors.join('\n')}`).toBe(true)
      expect(result.entries).toEqual(entries)
      existing.push(...entries.map((entry) => ({
        entry_id: entry.entry_id,
        language_tag: entry.language_tag,
        lemma: entry.lemma
      })))
    }
  })
})
