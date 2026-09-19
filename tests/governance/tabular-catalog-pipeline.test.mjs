import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  CANONICAL_COLUMNS,
  runTabularCatalogPipeline,
  serializeCanonicalCsv
} from '../../tools/tabular-catalog-pipeline.mjs'

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')
const BASE_ID = '69046998-47e6-5570-b469-5a5cc961a97e'

function baseline() {
  const catalog = [{
    entry_id: BASE_ID,
    language_tag: 'es',
    lemma: 'la mano',
    part_of_speech: 'noun',
    senses: [{
      sense_id: 's1',
      translations: ['la main'],
      example_source: 'Me lavo la mano.',
      example_target: 'Je me lave la main.'
    }],
    cefr_level: 'A1',
    cefr_rationale: 'fixture',
    themes: ['corps-sante'],
    provenance: { source: 'fixture', license: 'CC BY 4.0', authored_by: 'fixture' },
    status: 'draft',
    version: 1
  }]
  const catalogText = `${JSON.stringify(catalog, null, 2)}\n`
  const projection = {
    schema_version: '1.0',
    catalog_id: 'fr-es-a2-fixture',
    catalog_version: 'fixture-a2',
    source: { artifact: 'fixture-a2.json' },
    prompt_contexts: {},
    school_source_assignments: [],
    theme_path_assignments: [],
    source_counts: { school: {}, theme_paths: {} }
  }
  const projectionText = `${JSON.stringify(projection, null, 2)}\n`
  const manifest = {
    catalog_id: projection.catalog_id,
    catalog_version: projection.catalog_version,
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
  return { catalogText, projectionText, manifestText: `${JSON.stringify(manifest, null, 2)}\n` }
}

function row(overrides = {}) {
  const result = Object.fromEntries(CANONICAL_COLUMNS.map((column) => [column, '']))
  return {
    ...result,
    review_id: 'REV-B1-0001',
    spanish: 'la oficina',
    french: 'le bureau',
    type: 'nom',
    theme: 'travail-metiers',
    rationale: 'fixture B1',
    cefr_level: 'B1',
    school_lva: '3e',
    school_lvb: 'Première',
    review_status: 'À REVOIR',
    example_source: 'Trabajo en una oficina.',
    example_target: 'Je travaille dans un bureau.',
    ...overrides
  }
}

function source(csvText, overrides = {}) {
  return {
    schema_version: '1.0',
    archive_id: 'fixture-b1-approved',
    catalog_id: 'fr-es-b1-fixture',
    catalog_version: 'fixture-b1-r1',
    source_language: 'es',
    target_language: 'fr',
    cefr_level: 'B1',
    license: 'CC BY 4.0',
    authored_by: 'fixture',
    min_app_version: '0.1.0',
    source_excel: { filename: 'fixture.xlsx', sha256: '0'.repeat(64) },
    canonical_csv: { sha256: sha256(csvText) },
    expected_source_rows: 1,
    required_tracks: ['LVA', 'LVB'],
    ...overrides
  }
}

function run(rows, sourceOverrides = {}) {
  const csvText = serializeCanonicalCsv(rows)
  const sourceManifestText = `${JSON.stringify(source(csvText, sourceOverrides), null, 2)}\n`
  return runTabularCatalogPipeline({
    csvText,
    sourceManifestText,
    sourceManifestRepoPath: 'catalogs/fr-es/import/fixture/SOURCE_MANIFEST.json',
    baselineCatalogText: baseline().catalogText,
    baselineProjectionText: baseline().projectionText,
    baselineManifestText: baseline().manifestText
  })
}

test('builds byte-identical runtime outputs from the same canonical B1 input', () => {
  const first = run([row()])
  const second = run([row()])
  assert.equal(first.valid, true)
  assert.deepEqual(first.outputs, second.outputs)
  assert.equal(first.report.new_entries, 1)
  assert.equal(first.report.reconciled_entries, 0)
  const catalog = JSON.parse(first.outputs.catalogText)
  assert.equal(catalog.length, 2)
  assert.match(catalog[1].entry_id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)
  const projection = JSON.parse(first.outputs.projectionText)
  assert.deepEqual(projection.source_counts.school, { 'LVA:3e': 1, 'LVB:premiere': 1 })
  assert.deepEqual(first.report.data_only_paths, [
    'public/catalogs/runtime/catalog.json',
    'public/catalogs/runtime/runtime-projection.json',
    'public/catalogs/runtime/manifest.json'
  ])
})

test('fails closed instead of emitting a partial catalog when an example is missing', () => {
  const result = run([row({ example_target: '' })])
  assert.equal(result.valid, false)
  assert.equal(result.outputs, undefined)
  assert.ok(result.exceptions.some((error) => error.includes('missing-example_target')))
})

test('reuses an exact semantic identity and requires an explicit decision when its translation conflicts', () => {
  const conflict = row({
    spanish: 'la mano',
    french: 'la paume',
    example_source: 'Levanta la mano.',
    example_target: 'Lève la main.'
  })
  const blocked = run([conflict])
  assert.equal(blocked.valid, false)
  assert.ok(blocked.exceptions.some((error) => error.includes('existing-translation-conflict')))

  const accepted = run([{ ...conflict, existing_identity_decision: 'REUSE' }])
  assert.equal(accepted.valid, true)
  assert.equal(accepted.report.new_entries, 0)
  assert.equal(accepted.report.reconciled_entries, 1)
  const projection = JSON.parse(accepted.outputs.projectionText)
  assert.equal(projection.school_source_assignments[0].entry_id, BASE_ID)
})

test('merges an intra-batch source alias into one identity while preserving both source review assignments', () => {
  const primary = row({
    review_id: 'REV-B1-0100',
    spanish: 'quizás',
    french: 'peut-être',
    type: 'adverbe',
    theme: 'communication',
    example_source: 'Quizás venga mañana.',
    example_target: 'Peut-être viendra-t-il demain.'
  })
  const alias = row({
    review_id: 'REV-B1-0101',
    spanish: 'tal vez',
    french: 'peut-être',
    type: 'adverbe',
    theme: 'communication',
    example_source: 'Tal vez venga mañana.',
    example_target: 'Peut-être viendra-t-il demain.',
    alias_of_review_id: 'REV-B1-0100'
  })
  const result = run([primary, alias], { expected_source_rows: 2 })
  assert.equal(result.valid, true)
  assert.equal(result.report.new_entries, 1)
  assert.equal(result.report.reconciled_entries, 0)
  assert.equal(result.report.alias_rows, 1)
  const catalog = JSON.parse(result.outputs.catalogText)
  const created = catalog.find((entry) => entry.lemma === 'quizás')
  assert.ok(created)
  const projection = JSON.parse(result.outputs.projectionText)
  assert.deepEqual(projection.source_aliases[created.entry_id], ['tal vez'])
  const assignments = projection.school_source_assignments.filter((item) => item.entry_id === created.entry_id)
  assert.equal(new Set(assignments.map((item) => item.review_id)).size, 2)
})

test('can attach a new source alias to an existing baseline identity without rewriting the baseline lexical object', () => {
  const alias = row({
    review_id: 'REV-B1-0200',
    spanish: 'la manita',
    french: 'la main',
    type: 'nom',
    theme: 'corps-sante',
    example_source: 'Levanta la manita.',
    example_target: 'Lève la main.',
    alias_of_entry_id: BASE_ID
  })
  const result = run([alias])
  assert.equal(result.valid, true)
  assert.equal(result.report.new_entries, 0)
  assert.equal(result.report.alias_rows, 1)
  const catalog = JSON.parse(result.outputs.catalogText)
  assert.equal(catalog[0].lemma, 'la mano')
  assert.equal(catalog[0].source_aliases, undefined)
  const projection = JSON.parse(result.outputs.projectionText)
  assert.deepEqual(projection.source_aliases[BASE_ID], ['la manita'])
})

test('fails closed when an alias changes the target meaning', () => {
  const primary = row({ review_id: 'REV-B1-0300', spanish: 'quizás', french: 'peut-être', type: 'adverbe', theme: 'communication' })
  const alias = row({
    review_id: 'REV-B1-0301',
    spanish: 'tal vez',
    french: 'certainement',
    type: 'adverbe',
    theme: 'communication',
    alias_of_review_id: 'REV-B1-0300'
  })
  const result = run([primary, alias], { expected_source_rows: 2 })
  assert.equal(result.valid, false)
  assert.ok(result.exceptions.some((error) => error.includes('alias-translation-mismatch')))
})

test('reports a newly introduced reverse-prompt collision until explicit versioned cues cover every answer', () => {
  const colliding = row({
    spanish: 'la mano de obra',
    french: 'la main',
    type: 'expression',
    example_source: 'Falta mano de obra.',
    example_target: 'Il manque de la main-d’œuvre.'
  })
  const blocked = run([colliding])
  assert.equal(blocked.valid, false)
  assert.ok(blocked.exceptions.some((error) => error.includes('prompt-collision:fr-es:la main:missing-explicit-cue')))

  const accepted = run([
    { ...colliding, prompt_context_fr_es: 'Travail : ensemble des personnes disponibles pour produire.' }
  ], {
    prompt_contexts: {
      [BASE_ID]: { 'fr-es': 'Anatomie : partie du corps au bout du bras.' }
    }
  })
  assert.equal(accepted.valid, true)
  const projection = JSON.parse(accepted.outputs.projectionText)
  assert.equal(Object.keys(projection.prompt_contexts).length, 2)
})
