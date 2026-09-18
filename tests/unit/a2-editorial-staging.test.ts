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

interface SourceMapRow {
  review_id: string
  entry_id?: string
  lemma: string
  sense_key?: string
  reason?: string
  school_lva: string
  school_lvb: string
}

interface SourceMap {
  archive_id: string
  tranche_id: string
  source_range: [string, string]
  included: SourceMapRow[]
  excluded: SourceMapRow[]
}

interface StagingManifest {
  schema_version: string
  validation_profile: string
  archive_id: string
  source_language: string
  target_language: string
  expected_license: string
  canonical_catalog: string
  canonical_candidate_sha: string
  expected_source_counts: { total: number; school: Record<string, number> }
  expected_active_counts: { total: number; school: Record<string, number> }
  expected_excluded_counts: { total: number; school: Record<string, number> }
  tranches: Array<{
    tranche_id: string
    cefr_level: 'A2'
    source_range: [string, string]
    source_map: string
    entry_files: string[]
    expected_included: number
    expected_excluded: number
    materializer_batch_id: string
  }>
}

interface MacroManifest {
  validation_profile: string
  micro_manifest: string
  macro_batches: Array<{
    macro_batch_id: string
    micro_tranche_ids: string[]
    source_range: [string, string]
    expected_source_units: number
    expected_drafts: number
    expected_excluded_or_reconciled: number
    qualification_mode: string
    semantic_review_mode: string
  }>
}

interface CanonicalIdentity {
  entry_id: string
  language_tag: string
  lemma: string
  sense_key?: string
}

const root = process.cwd()
const subtle = webcrypto.subtle as unknown as SubtleCrypto

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8')) as T
}

const manifest = readJson<StagingManifest>('catalogs/fr-es/a2/drafts/staging-batches.manifest.json')
const macroManifest = readJson<MacroManifest>('catalogs/fr-es/a2/drafts/macro-batches.manifest.json')
const baseline = readJson<CanonicalIdentity[]>(manifest.canonical_catalog)

function exactRange([start, end]: [string, string]): string[] {
  const a = /^(.*?)(\d+)$/u.exec(start)
  const b = /^(.*?)(\d+)$/u.exec(end)
  if (!a || !b || a[1] !== b[1] || a[2].length !== b[2].length) throw new Error(`unsupported-range:${start}..${end}`)
  const first = Number(a[2])
  const last = Number(b[2])
  return Array.from({ length: last - first + 1 }, (_, index) => `${a[1]}${String(first + index).padStart(a[2].length, '0')}`)
}

function loadEntries(paths: string[]): PreparedLexicalEntry[] {
  return paths.flatMap((path) => readJson<PreparedLexicalEntry[]>(path))
}

function semanticKey(entry: Pick<PreparedLexicalEntry, 'language_tag' | 'lemma' | 'sense_key'>): string {
  const base = `${entry.language_tag.normalize('NFC').trim().toLocaleLowerCase('es')}:${entry.lemma.normalize('NFC').trim().toLocaleLowerCase('es')}`
  return entry.sense_key ? `${base}:sense:${entry.sense_key.normalize('NFC').trim().toLocaleLowerCase('es')}` : base
}

function batchInput(entry: PreparedLexicalEntry): LexicalBatchEntryInput {
  return {
    lemma: entry.lemma,
    ...(entry.sense_key === undefined ? {} : { sense_key: entry.sense_key }),
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

function schoolCounts(rows: SourceMapRow[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    counts[`LVA:${row.school_lva}`] = (counts[`LVA:${row.school_lva}`] ?? 0) + 1
    counts[`LVB:${row.school_lvb}`] = (counts[`LVB:${row.school_lvb}`] ?? 0) + 1
  }
  return counts
}

describe('A2 level editorial staging', () => {
  it('binds the complete level to the accepted 475-entry A1 human baseline', () => {
    expect(manifest.validation_profile).toBe('EDITORIAL_STAGING')
    expect(manifest.canonical_candidate_sha).toBe('01318dfb939c77f7ee4a79407a9c51aceb65357e')
    expect(baseline).toHaveLength(475)
    expect(new Set(baseline.map((entry) => entry.entry_id)).size).toBe(475)
    expect(manifest.tranches).toHaveLength(18)
  })

  it('accounts exactly for all 603 source rows and all school assignments', () => {
    const included: SourceMapRow[] = []
    const excluded: SourceMapRow[] = []
    const reviewIds = new Set<string>()

    for (const tranche of manifest.tranches) {
      const sourceMap = readJson<SourceMap>(tranche.source_map)
      expect(sourceMap.archive_id).toBe(manifest.archive_id)
      expect(sourceMap.tranche_id).toBe(tranche.tranche_id)
      expect(sourceMap.source_range).toEqual(tranche.source_range)
      expect(sourceMap.included).toHaveLength(tranche.expected_included)
      expect(sourceMap.excluded).toHaveLength(tranche.expected_excluded)
      expect(loadEntries(tranche.entry_files)).toHaveLength(tranche.expected_included)

      const accounted = [...sourceMap.included, ...sourceMap.excluded].map((row) => row.review_id).sort()
      expect(accounted).toEqual(exactRange(tranche.source_range))
      for (const row of [...sourceMap.included, ...sourceMap.excluded]) {
        expect(reviewIds.has(row.review_id), `duplicate review id ${row.review_id}`).toBe(false)
        reviewIds.add(row.review_id)
        expect(row.school_lva).toMatch(/^(5e|4e)$/u)
        expect(row.school_lvb).toMatch(/^(3e|Seconde)$/u)
      }
      included.push(...sourceMap.included)
      excluded.push(...sourceMap.excluded)
    }

    expect(reviewIds.size).toBe(manifest.expected_source_counts.total)
    expect(included).toHaveLength(manifest.expected_active_counts.total)
    expect(excluded).toHaveLength(manifest.expected_excluded_counts.total)
    expect(schoolCounts([...included, ...excluded])).toEqual(manifest.expected_source_counts.school)
    expect(schoolCounts(included)).toEqual(manifest.expected_active_counts.school)
    expect(schoolCounts(excluded)).toEqual(manifest.expected_excluded_counts.school)
  })

  it('keeps all 592 drafts schema-valid, unique and traceable to their source-map rows', () => {
    const ids = new Set<string>()
    const semantics = new Set<string>()
    for (const tranche of manifest.tranches) {
      const sourceMap = readJson<SourceMap>(tranche.source_map)
      const entries = loadEntries(tranche.entry_files)
      const byId = new Map(entries.map((entry) => [entry.entry_id, entry]))
      expect(new Set(sourceMap.included.map((row) => row.entry_id))).toEqual(new Set(byId.keys()))

      for (const row of sourceMap.included) {
        const entry = byId.get(row.entry_id ?? '')
        expect(entry, `missing draft for ${row.review_id}`).toBeDefined()
        expect(entry?.lemma).toBe(row.lemma)
        expect(entry?.sense_key).toBe(row.sense_key)
      }

      for (const entry of entries) {
        const validation = validateLexicalEntry(entry)
        expect(validation.valid, `${tranche.tranche_id}/${entry.lemma}: ${JSON.stringify(validation.errors)}`).toBe(true)
        expect(entry.status).toBe('draft')
        expect(entry.version).toBe(1)
        expect(entry.provenance.license).toBe(manifest.expected_license)
        expect(entry.provenance).not.toHaveProperty('reviewed_by')
        expect(entry.provenance).not.toHaveProperty('reviewed_at')
        expect(entry.senses.every((sense) => sense.translations.length > 0 && sense.example_source.trim() !== '' && sense.example_target.trim() !== '')).toBe(true)
        expect(entry.themes.every((theme) => canonicalThemeIds.has(theme as never))).toBe(true)
        expect(ids.has(entry.entry_id), `duplicate A2 UUID ${entry.entry_id}`).toBe(false)
        ids.add(entry.entry_id)
        const semantic = semanticKey(entry)
        expect(semantics.has(semantic), `duplicate A2 semantic identity ${semantic}`).toBe(false)
        semantics.add(semantic)
      }
    }
    expect(ids.size).toBe(592)
    expect(semantics.size).toBe(592)
  })

  it('reconciles all A1 collisions only to the accepted A1 baseline and justifies every exclusion', () => {
    const baselineById = new Map(baseline.map((entry) => [entry.entry_id, entry]))
    let reconciled = 0
    let editorialExclusions = 0
    for (const tranche of manifest.tranches) {
      const sourceMap = readJson<SourceMap>(tranche.source_map)
      for (const row of sourceMap.excluded) {
        expect(row.reason?.trim(), `missing exclusion reason for ${row.review_id}`).not.toBe('')
        if (row.reason?.includes('A1 collision')) {
          reconciled += 1
          expect(row.entry_id, `missing accepted A1 UUID for ${row.review_id}`).toBeTruthy()
          expect(baselineById.get(row.entry_id ?? '')?.lemma).toBe(row.lemma)
        } else {
          editorialExclusions += 1
        }
      }
    }
    expect(reconciled).toBe(8)
    expect(editorialExclusions).toBe(3)
  })

  it('reproduces every micro-tranche deterministically with ADR-038 homograph identities', async () => {
    const existing: ExistingLexicalIdentity[] = baseline.map((entry) => ({
      entry_id: entry.entry_id,
      language_tag: entry.language_tag,
      lemma: entry.lemma,
      ...(entry.sense_key === undefined ? {} : { sense_key: entry.sense_key })
    }))

    for (const tranche of manifest.tranches) {
      const entries = loadEntries(tranche.entry_files)
      for (const entry of entries) {
        expect(entry.entry_id).toBe(await stableLexicalUuid(
          manifest.source_language,
          manifest.target_language,
          entry.lemma,
          subtle,
          undefined,
          entry.sense_key
        ))
      }

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
        lemma: entry.lemma,
        ...(entry.sense_key === undefined ? {} : { sense_key: entry.sense_key })
      })))
    }
  })

  it('records the whole A2 level as one public macro qualification unit', () => {
    expect(macroManifest.validation_profile).toBe('EDITORIAL_STAGING')
    expect(macroManifest.micro_manifest).toBe('catalogs/fr-es/a2/drafts/staging-batches.manifest.json')
    expect(macroManifest.macro_batches).toHaveLength(1)
    expect(macroManifest.macro_batches[0]).toMatchObject({
      macro_batch_id: 'a2-level-macro-r1',
      source_range: ['REV-A2-0001', 'REV-A2-0603'],
      expected_source_units: 603,
      expected_drafts: 592,
      expected_excluded_or_reconciled: 11,
      qualification_mode: 'single_public_editorial_staging',
      semantic_review_mode: 'complete_aggregate'
    })
    expect(macroManifest.macro_batches[0].micro_tranche_ids).toEqual(manifest.tranches.map((tranche) => tranche.tranche_id))
  })
})
