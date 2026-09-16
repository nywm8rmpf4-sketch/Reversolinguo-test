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

interface CueCollisionException {
  target_cue: string
  source_lemmas: string[]
  rationale: string
}

interface BulkManifest {
  schema_version: string
  validation_profile: string
  archive_id: string
  source_language: string
  target_language: string
  expected_license: string
  canonical_catalog: string
  allowed_target_cue_collisions?: CueCollisionException[]
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

interface CueOccurrence {
  lemma: string
  source: 'canonical' | 'staging'
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

function normalizedCue(cue: string): string {
  return cue.normalize('NFC').trim().toLocaleLowerCase('fr')
}

function normalizedLemma(lemma: string): string {
  return lemma.normalize('NFC').trim().toLocaleLowerCase('es')
}

function exactRange([start, end]: [string, string]): string[] {
  const startMatch = /^(.*?)(\d+)$/u.exec(start)
  const endMatch = /^(.*?)(\d+)$/u.exec(end)
  if (!startMatch || !endMatch || startMatch[1] !== endMatch[1] || startMatch[2].length !== endMatch[2].length) {
    throw new Error(`unsupported-source-range:${start}..${end}`)
  }
  const first = Number(startMatch[2])
  const last = Number(endMatch[2])
  if (!Number.isInteger(first) || !Number.isInteger(last) || last < first) throw new Error(`invalid-source-range:${start}..${end}`)
  return Array.from({ length: last - first + 1 }, (_, index) => `${startMatch[1]}${String(first + index).padStart(startMatch[2].length, '0')}`)
}

function loadEntries(files: string[]): PreparedLexicalEntry[] {
  return files.flatMap((file) => readJson<PreparedLexicalEntry[]>(file))
}

function stagedEntries(): PreparedLexicalEntry[] {
  return manifest.tranches.flatMap((tranche) => loadEntries(tranche.entry_files))
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

function collisionKey(cue: string, lemmas: string[]): string {
  return `${normalizedCue(cue)}::${lemmas.map(normalizedLemma).sort().join('|')}`
}

function promotionProjection(entry: PreparedLexicalEntry): Record<string, unknown> {
  const clone = structuredClone(entry) as unknown as Record<string, unknown>
  delete clone.status
  const provenance = clone.provenance as Record<string, unknown>
  delete provenance.reviewed_by
  delete provenance.reviewed_at
  return clone
}

const staged = stagedEntries()
const stagedIds = new Set(staged.map((entry) => entry.entry_id))
const prePromotionCanonicalEntries = canonicalEntries.filter((entry) => !stagedIds.has(entry.entry_id))

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
      for (const row of sourceMap.excluded) expect(row.reason?.trim(), `missing exclusion reason for ${row.review_id}`).not.toBe('')
    }
  })

  it('validates all archived tranches with one lexical invariant set and no invented review provenance', () => {
    for (const tranche of manifest.tranches) {
      for (const entry of loadEntries(tranche.entry_files)) {
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

  it('rejects exact target-cue collisions against the pre-promotion canonical baseline unless explicitly justified', () => {
    const byCue = new Map<string, CueOccurrence[]>()
    const addEntry = (entry: PreparedLexicalEntry, source: CueOccurrence['source']) => {
      for (const sense of entry.senses) {
        for (const translation of sense.translations) {
          const cue = normalizedCue(translation)
          const occurrences = byCue.get(cue) ?? []
          occurrences.push({ lemma: entry.lemma, source })
          byCue.set(cue, occurrences)
        }
      }
    }
    prePromotionCanonicalEntries.forEach((entry) => addEntry(entry, 'canonical'))
    staged.forEach((entry) => addEntry(entry, 'staging'))

    const observed = new Map<string, { cue: string; lemmas: string[]; sources: string[] }>()
    for (const [cue, occurrences] of byCue) {
      const lemmaMap = new Map<string, { lemma: string; sources: Set<string> }>()
      for (const occurrence of occurrences) {
        const key = normalizedLemma(occurrence.lemma)
        const current = lemmaMap.get(key) ?? { lemma: occurrence.lemma, sources: new Set<string>() }
        current.sources.add(occurrence.source)
        lemmaMap.set(key, current)
      }
      if (lemmaMap.size < 2) continue
      if (![...lemmaMap.values()].some((item) => item.sources.has('staging'))) continue
      const lemmas = [...lemmaMap.values()].map((item) => item.lemma).sort((a, b) => normalizedLemma(a).localeCompare(normalizedLemma(b), 'es'))
      const sources = [...lemmaMap.values()].map((item) => `${item.lemma}[${[...item.sources].sort().join('+')}]`)
      observed.set(collisionKey(cue, lemmas), { cue, lemmas, sources })
    }

    const allowed = new Map<string, CueCollisionException>()
    for (const exception of manifest.allowed_target_cue_collisions ?? []) {
      expect(exception.target_cue.trim()).not.toBe('')
      expect(exception.rationale.trim()).not.toBe('')
      expect(new Set(exception.source_lemmas.map(normalizedLemma)).size).toBeGreaterThan(1)
      const key = collisionKey(exception.target_cue, exception.source_lemmas)
      expect(allowed.has(key)).toBe(false)
      allowed.set(key, exception)
    }
    expect([...observed.entries()].filter(([key]) => !allowed.has(key)).map(([, item]) => `${item.cue} -> ${item.sources.join(', ')}`)).toEqual([])
    expect([...allowed.keys()].filter((key) => !observed.has(key))).toEqual([])
  })

  it('proves deterministic UUIDs and exact identity-preserving promotion of all 415 staged entries', async () => {
    expect(staged).toHaveLength(415)
    expect(stagedIds.size).toBe(415)
    expect(prePromotionCanonicalEntries).toHaveLength(60)
    const stagingSemantics = new Set<string>()
    for (const entry of staged) {
      expect(entry.entry_id).toBe(await stableLexicalUuid(manifest.source_language, manifest.target_language, entry.lemma, subtle))
      const semantic = semanticKey(entry.language_tag, entry.lemma)
      expect(stagingSemantics.has(semantic), `duplicate staged semantic ${entry.lemma}`).toBe(false)
      stagingSemantics.add(semantic)
      const promoted = canonicalEntries.find((candidate) => candidate.entry_id === entry.entry_id)
      expect(promoted, `missing promoted entry ${entry.entry_id}`).toBeDefined()
      expect(promoted?.status).toBe('reviewed')
      expect(promotionProjection(promoted!)).toEqual(promotionProjection(entry))
    }
  })

  it('verifies every reconciliation target belongs to the 60-entry pre-promotion canonical baseline', () => {
    const canonicalById = new Map(prePromotionCanonicalEntries.map((entry) => [entry.entry_id, entry]))
    for (const tranche of manifest.tranches) {
      const sourceMap = readJson<SourceMap>(tranche.source_map)
      for (const excluded of sourceMap.excluded) {
        for (const target of excluded.canonical_entries ?? []) {
          expect(canonicalById.get(target.entry_id)).toEqual(expect.objectContaining({ entry_id: target.entry_id, lemma: target.lemma }))
        }
      }
    }
  })

  it('reproduces every tranche exactly through ADR-025 against the reconstructed pre-promotion baseline', async () => {
    const existing: ExistingLexicalIdentity[] = prePromotionCanonicalEntries.map((entry) => ({
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
      existing.push(...entries.map((entry) => ({ entry_id: entry.entry_id, language_tag: entry.language_tag, lemma: entry.lemma })))
    }
  })
})
