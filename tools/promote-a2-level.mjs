#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const STAGING_MANIFEST = 'catalogs/fr-es/a2/drafts/staging-batches.manifest.json'
const A1_REFERENCE_DIR = 'catalogs/fr-es/a2/reference/a1-human-validated-01318dfb939c'
const RECONCILIATION = 'catalogs/fr-es/a2/reconciliation/A2_DELTA_RECONCILIATION_2026-09-17.json'
const OUTPUT_DIR = 'catalogs/fr-es/a2'
const REPORT = 'evidence/active/A2_RUNTIME_GENERATION_REPORT.json'
const EXPECTED_A1_CANDIDATE = '01318dfb939c77f7ee4a79407a9c51aceb65357e'
const EXPECTED_A1_CATALOG_SHA256 = 'bb67e6903e7129b72e339b39b782e428bb8f3b35dbbf614db80a381c315d1be5'
const EXPECTED_A1_PROJECTION_SHA256 = '27b3d65a2267f71e2d1dd79d03793a82f79de87e8ca2b5b28a86f24dd7ccb38c'
const CATALOG_VERSION = '2026.09-a2-r1'

function read(path) {
  return readFileSync(resolve(ROOT, path), 'utf8')
}

function json(path) {
  return JSON.parse(read(path))
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function normalized(value) {
  return String(value ?? '').normalize('NFC').trim()
}

function normalizedGrade(value) {
  const grade = normalized(value)
  if (grade === 'Seconde') return 'seconde'
  if (['6e', '5e', '4e', '3e', 'seconde', 'premiere', 'terminale'].includes(grade)) return grade
  throw new Error(`INVALID_GRADE:${grade || '<missing>'}`)
}

function counts(values) {
  const result = {}
  for (const value of values) result[value] = (result[value] ?? 0) + 1
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)))
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function write(path, value) {
  const absolute = resolve(ROOT, path)
  mkdirSync(dirname(absolute), { recursive: true })
  writeFileSync(absolute, typeof value === 'string' ? value : stableJson(value), 'utf8')
}

function exactRange([start, end]) {
  const a = /^(.*?)(\d+)$/u.exec(start)
  const b = /^(.*?)(\d+)$/u.exec(end)
  if (!a || !b || a[1] !== b[1] || a[2].length !== b[2].length) throw new Error(`UNSUPPORTED_RANGE:${start}..${end}`)
  const first = Number(a[2])
  const last = Number(b[2])
  return Array.from({ length: last - first + 1 }, (_, index) => `${a[1]}${String(first + index).padStart(a[2].length, '0')}`)
}

function semanticKey(entry) {
  const base = `${normalized(entry.language_tag).toLocaleLowerCase('es')}:${normalized(entry.lemma).toLocaleLowerCase('es')}`
  const sense = normalized(entry.sense_key).toLocaleLowerCase('es')
  return sense ? `${base}:sense:${sense}` : base
}

function assert(condition, code) {
  if (!condition) throw new Error(code)
}

export function generateA2Runtime() {
  const staging = json(STAGING_MANIFEST)
  const a1CatalogText = read(`${A1_REFERENCE_DIR}/catalog.json`)
  const a1ProjectionText = read(`${A1_REFERENCE_DIR}/runtime-projection.json`)
  const a1Manifest = json(`${A1_REFERENCE_DIR}/manifest.json`)
  const a1Catalog = JSON.parse(a1CatalogText)
  const a1Projection = JSON.parse(a1ProjectionText)
  const reconciliation = json(RECONCILIATION)

  assert(staging.canonical_candidate_sha === EXPECTED_A1_CANDIDATE, 'A1_CANDIDATE_SHA_MISMATCH')
  assert(a1Catalog.length === 475, `A1_ENTRY_COUNT:${a1Catalog.length}`)
  assert(sha256(a1CatalogText) === EXPECTED_A1_CATALOG_SHA256, 'A1_CATALOG_SHA256_MISMATCH')
  assert(sha256(a1ProjectionText) === EXPECTED_A1_PROJECTION_SHA256, 'A1_PROJECTION_SHA256_MISMATCH')
  assert(a1Manifest.catalog_sha256 === EXPECTED_A1_CATALOG_SHA256, 'A1_MANIFEST_CATALOG_HASH_MISMATCH')
  assert(a1Manifest.projection_sha256 === EXPECTED_A1_PROJECTION_SHA256, 'A1_MANIFEST_PROJECTION_HASH_MISMATCH')
  assert(a1Manifest.human_review === 'PASS', 'A1_HUMAN_REVIEW_NOT_PASS')

  const baselineById = new Map(a1Catalog.map((entry) => [entry.entry_id, entry]))
  const collisionByReview = new Map(
    reconciliation.collisions_reconciled_to_a1.map((row) => [row.review_id, row.a1_entry_id])
  )

  const a2Entries = []
  const includedRows = []
  const excludedRows = []
  const allReviewIds = new Set()

  for (const tranche of staging.tranches) {
    const sourceMap = json(tranche.source_map)
    const entries = tranche.entry_files.flatMap((path) => json(path))
    assert(sourceMap.tranche_id === tranche.tranche_id, `TRANCHE_ID:${tranche.tranche_id}`)
    assert(JSON.stringify(sourceMap.source_range) === JSON.stringify(tranche.source_range), `TRANCHE_RANGE:${tranche.tranche_id}`)
    assert(entries.length === tranche.expected_included, `TRANCHE_ENTRY_COUNT:${tranche.tranche_id}`)
    assert(sourceMap.included.length === tranche.expected_included, `TRANCHE_INCLUDED_COUNT:${tranche.tranche_id}`)
    assert(sourceMap.excluded.length === tranche.expected_excluded, `TRANCHE_EXCLUDED_COUNT:${tranche.tranche_id}`)

    const accounted = [...sourceMap.included, ...sourceMap.excluded].map((row) => row.review_id).sort()
    assert(JSON.stringify(accounted) === JSON.stringify(exactRange(tranche.source_range)), `TRANCHE_SOURCE_COVERAGE:${tranche.tranche_id}`)

    const entriesById = new Map(entries.map((entry) => [entry.entry_id, entry]))
    for (const row of sourceMap.included) {
      assert(!allReviewIds.has(row.review_id), `DUPLICATE_REVIEW_ID:${row.review_id}`)
      allReviewIds.add(row.review_id)
      const entry = entriesById.get(row.entry_id)
      assert(entry, `MISSING_DRAFT:${row.review_id}`)
      assert(entry.lemma === row.lemma, `LEMMA_MISMATCH:${row.review_id}`)
      assert((entry.sense_key ?? undefined) === (row.sense_key ?? undefined), `SENSE_KEY_MISMATCH:${row.review_id}`)
      assert(normalized(row.school_lva) && normalized(row.school_lvb), `SCHOOL_MISSING:${row.review_id}`)
      includedRows.push(row)
    }
    for (const row of sourceMap.excluded) {
      assert(!allReviewIds.has(row.review_id), `DUPLICATE_REVIEW_ID:${row.review_id}`)
      allReviewIds.add(row.review_id)
      assert(normalized(row.reason), `EXCLUSION_REASON_MISSING:${row.review_id}`)
      assert(normalized(row.school_lva) && normalized(row.school_lvb), `SCHOOL_MISSING:${row.review_id}`)
      excludedRows.push(row)
    }
    a2Entries.push(...entries)
  }

  assert(allReviewIds.size === 603, `A2_SOURCE_COUNT:${allReviewIds.size}`)
  assert(a2Entries.length === 592, `A2_DRAFT_COUNT:${a2Entries.length}`)
  assert(excludedRows.length === 11, `A2_EXCLUDED_COUNT:${excludedRows.length}`)

  const a2Ids = new Set(a2Entries.map((entry) => entry.entry_id))
  const a2Semantics = new Set(a2Entries.map(semanticKey))
  assert(a2Ids.size === 592, `A2_UUID_UNIQUE:${a2Ids.size}`)
  assert(a2Semantics.size === 592, `A2_SEMANTIC_UNIQUE:${a2Semantics.size}`)
  assert(a2Entries.every((entry) => entry.status === 'draft' && entry.version === 1), 'A2_DRAFT_STATUS_INVALID')
  assert(a2Entries.every((entry) => !baselineById.has(entry.entry_id)), 'A2_UUID_OVERLAP_WITH_A1')

  const catalog = [...a1Catalog, ...a2Entries]
  assert(catalog.length === 1067, `CUMULATIVE_COUNT:${catalog.length}`)
  assert(new Set(catalog.map((entry) => entry.entry_id)).size === 1067, 'CUMULATIVE_UUID_DUPLICATE')
  assert(JSON.stringify(catalog.slice(0, 475)) === JSON.stringify(a1Catalog), 'A1_PREFIX_NOT_EXACT')

  const catalogById = new Map(catalog.map((entry) => [entry.entry_id, entry]))
  const a2SchoolAssignments = []
  const newOnlySchoolAssignments = []
  let reconciled = 0
  let editorialExcluded = 0

  for (const row of includedRows) {
    const entry = catalogById.get(row.entry_id)
    assert(entry, `A2_INCLUDED_UNKNOWN_ENTRY:${row.review_id}`)
    const theme = entry.themes?.[0]
    assert(theme, `A2_INCLUDED_THEME_MISSING:${row.review_id}`)
    for (const [track, grade] of [['LVA', row.school_lva], ['LVB', row.school_lvb]]) {
      const assignment = { review_id: row.review_id, entry_id: row.entry_id, track, grade: normalizedGrade(grade), theme }
      a2SchoolAssignments.push(assignment)
      newOnlySchoolAssignments.push(assignment)
    }
  }

  for (const row of excludedRows) {
    const baselineId = collisionByReview.get(row.review_id)
    if (baselineId) {
      reconciled += 1
      const entry = baselineById.get(baselineId)
      assert(entry, `RECONCILIATION_UNKNOWN_A1:${row.review_id}`)
      const theme = entry.themes?.[0]
      assert(theme, `RECONCILIATION_THEME_MISSING:${row.review_id}`)
      for (const [track, grade] of [['LVA', row.school_lva], ['LVB', row.school_lvb]]) {
        a2SchoolAssignments.push({ review_id: row.review_id, entry_id: baselineId, track, grade: normalizedGrade(grade), theme })
      }
    } else {
      editorialExcluded += 1
    }
  }

  assert(reconciled === 8, `RECONCILED_COUNT:${reconciled}`)
  assert(editorialExcluded === 3, `EDITORIAL_EXCLUDED_COUNT:${editorialExcluded}`)
  assert(a2SchoolAssignments.length === 1200, `A2_PROJECTED_SCHOOL_ASSIGNMENTS:${a2SchoolAssignments.length}`)
  assert(newOnlySchoolAssignments.length === 1184, `A2_NEW_ONLY_SCHOOL_ASSIGNMENTS:${newOnlySchoolAssignments.length}`)

  const a2ProjectedSchoolCounts = counts(a2SchoolAssignments.map((row) => `${row.track}:${row.grade}`))
  const a2NewOnlySchoolCounts = counts(newOnlySchoolAssignments.map((row) => `${row.track}:${row.grade}`))
  assert(JSON.stringify(a2ProjectedSchoolCounts) === JSON.stringify({
    'LVA:4e': 262, 'LVA:5e': 338, 'LVB:3e': 323, 'LVB:seconde': 277
  }), `A2_PROJECTED_SCHOOL_COUNTS:${JSON.stringify(a2ProjectedSchoolCounts)}`)
  assert(JSON.stringify(a2NewOnlySchoolCounts) === JSON.stringify({
    'LVA:4e': 259, 'LVA:5e': 333, 'LVB:3e': 318, 'LVB:seconde': 274
  }), `A2_NEW_ONLY_SCHOOL_COUNTS:${JSON.stringify(a2NewOnlySchoolCounts)}`)

  const a2VoyageAssignments = a2Entries
    .filter((entry) => entry.themes?.includes('voyage'))
    .map((entry) => ({ entry_id: entry.entry_id, path_id: 'voyage', cefr_level: 'A2', theme: 'voyage' }))

  const projectionSource = {
    schema_version: '1.0',
    catalog_id: 'fr-es-a2',
    catalog_version: CATALOG_VERSION,
    baseline_a1: {
      candidate_sha: EXPECTED_A1_CANDIDATE,
      catalog_sha256: EXPECTED_A1_CATALOG_SHA256,
      projection_sha256: EXPECTED_A1_PROJECTION_SHA256,
      entry_count: 475
    },
    a2_staging: {
      manifest: STAGING_MANIFEST,
      manifest_sha256: sha256(read(STAGING_MANIFEST)),
      source_units: 603,
      new_entries: 592,
      reconciled_to_a1: 8,
      editorial_exclusions: 3,
      school_source_counts: staging.expected_source_counts.school,
      school_new_only_counts: staging.expected_active_counts.school,
      school_projected_counts: a2ProjectedSchoolCounts
    }
  }
  const projectionSourcePath = `${OUTPUT_DIR}/projection-source.json`
  const projectionSourceText = stableJson(projectionSource)

  const schoolAssignments = [...a1Projection.school_source_assignments, ...a2SchoolAssignments]
  const themeAssignments = [...a1Projection.theme_path_assignments, ...a2VoyageAssignments]
  const projection = {
    schema_version: '1.0',
    catalog_id: 'fr-es-a2',
    catalog_version: CATALOG_VERSION,
    source: { artifact: projectionSourcePath, sha256: sha256(projectionSourceText) },
    school_source_assignments: schoolAssignments,
    theme_path_assignments: themeAssignments,
    source_counts: {
      school: counts(schoolAssignments.map((row) => `${row.track}:${row.grade}`)),
      theme_paths: counts(themeAssignments.map((row) => `${row.path_id}:${row.cefr_level}`))
    }
  }

  const catalogText = stableJson(catalog)
  const projectionText = stableJson(projection)
  const manifest = {
    catalog_id: 'fr-es-a2',
    catalog_version: CATALOG_VERSION,
    source_language: 'es',
    target_language: 'fr',
    cefr_level: 'A2',
    entry_count: catalog.length,
    license: 'CC BY 4.0',
    schema_id: 'https://reversolinguo.app/schemas/lexical-entry-v2.json',
    min_app_version: '0.1.0',
    catalog_sha256: sha256(catalogText),
    projection_sha256: sha256(projectionText),
    status: 'draft-human-review',
    human_review: 'NOT_EXECUTED'
  }

  const report = {
    schema_version: '1.0',
    result: 'PASS',
    generated_at_policy: 'deterministic-no-timestamp-in-runtime-bytes',
    baseline_a1_candidate_sha: EXPECTED_A1_CANDIDATE,
    baseline_a1_entries: 475,
    a2_source_units: 603,
    a2_new_entries: 592,
    a2_reconciled_to_a1: reconciled,
    a2_editorial_exclusions: editorialExcluded,
    cumulative_entries: catalog.length,
    cumulative_unique_ids: new Set(catalog.map((entry) => entry.entry_id)).size,
    cumulative_unique_semantic_identities: new Set(catalog.map(semanticKey)).size,
    a2_new_only_school_counts: a2NewOnlySchoolCounts,
    a2_projected_school_counts: a2ProjectedSchoolCounts,
    cumulative_school_source_counts: projection.source_counts.school,
    a2_voyage_entries: a2VoyageAssignments.length,
    homograph: {
      review_id: 'REV-A2-0603',
      lemma: 'la salsa',
      sense_key: 'dance-music',
      entry_id: 'd45f1a20-8bc3-548f-bafb-22a594b9fd2e'
    },
    catalog_sha256: manifest.catalog_sha256,
    projection_sha256: manifest.projection_sha256,
    projection_source_sha256: projection.source.sha256
  }
  assert(report.cumulative_unique_ids === 1067, `FINAL_UUID_COUNT:${report.cumulative_unique_ids}`)
  assert(report.cumulative_unique_semantic_identities === 1067, `FINAL_SEMANTIC_COUNT:${report.cumulative_unique_semantic_identities}`)

  write(projectionSourcePath, projectionSourceText)
  write(`${OUTPUT_DIR}/catalog.json`, catalogText)
  write(`${OUTPUT_DIR}/runtime-projection.json`, projectionText)
  write(`${OUTPUT_DIR}/manifest.json`, manifest)
  write(REPORT, report)

  return report
}

const invokedAsScript = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedAsScript) {
  try {
    const report = generateA2Runtime()
    process.stdout.write(`${JSON.stringify(report)}\n`)
  } catch (error) {
    process.stderr.write(`A2_RUNTIME_GENERATION_FAIL: ${error.message}\n`)
    process.exitCode = 2
  }
}
