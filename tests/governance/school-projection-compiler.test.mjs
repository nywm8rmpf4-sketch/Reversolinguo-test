import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { compileSchoolProjection } from '../../tools/compile-school-projection.mjs'

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function fixture() {
  const catalog = [
    { entry_id: '00000000-0000-5000-8000-000000000001', themes: ['corps'] },
    { entry_id: '00000000-0000-5000-8000-000000000002', themes: ['voyage'] }
  ]
  const catalogText = `${JSON.stringify(catalog, null, 2)}\n`
  const lva = '65'
  const lvb = '64'
  const source = {
    schema_version: '1.1',
    artifact_name: 'fixture.xlsx',
    artifact_sha256: '0'.repeat(64),
    validation_status: 'PRODUCT_OWNER_SELECTED_FOR_USE',
    catalog_id: 'fr-es-a1',
    catalog_entry_count: 2,
    catalog_sha256: sha256(catalogText),
    runtime_projection: { catalog_version: 'fixture-r1', theme_aliases: { corps: 'corps-sante' } },
    school_classifications: {
      LVA: { '6e': 1, '5e': 1 },
      LVB: { '6e (bilangue)': 1, '4e': 1 }
    },
    compact_lossless_encoding: {
      basis: 'fixture',
      LVA_codes: lva,
      LVA_legend: { '6': '6e', '5': '5e' },
      LVB_codes: lvb,
      LVB_legend: { '6': '6e (bilangue)', '4': '4e' },
      codes_sha256: sha256(`${lva}\n${lvb}\n`)
    },
    theme_path_assignments: [
      { entry_id: catalog[1].entry_id, path_id: 'voyage', cefr_level: 'A1', theme: 'voyage' }
    ]
  }
  return { catalogText, source, sourceText: `${JSON.stringify(source, null, 2)}\n` }
}

test('compiles exact school codes without inferring classifications', () => {
  const { catalogText, sourceText } = fixture()
  const output = compileSchoolProjection({ catalogText, sourceManifestText: sourceText, sourceManifestRepoPath: 'catalogs/fr-es/review/fixture/SOURCE_MANIFEST.json' })
  const projection = JSON.parse(output)
  assert.equal(projection.catalog_version, 'fixture-r1')
  assert.equal(projection.school_source_assignments.length, 4)
  assert.deepEqual(projection.source_counts.school, { 'LVA:5e': 1, 'LVA:6e': 1, 'LVB:4e': 1, 'LVB:6e': 1 })
  assert.equal(projection.school_source_assignments[0].theme, 'corps-sante')
  assert.equal(projection.school_source_assignments[1].grade, '6e')
  assert.equal(projection.theme_path_assignments.length, 1)
  assert.equal(projection.source.sha256, sha256(sourceText))
})

test('rejects a catalogue whose exact bytes no longer match the source manifest', () => {
  const { catalogText, sourceText } = fixture()
  const changed = `${catalogText.trim()} \n`
  assert.throws(() => compileSchoolProjection({ catalogText: changed, sourceManifestText: sourceText, sourceManifestRepoPath: 'fixture.json' }), /CATALOG_SHA256_MISMATCH/)
})

test('rejects changed classification codes unless their checksum is updated', () => {
  const { catalogText, source } = fixture()
  source.compact_lossless_encoding.LVA_codes = '66'
  const sourceText = `${JSON.stringify(source, null, 2)}\n`
  assert.throws(() => compileSchoolProjection({ catalogText, sourceManifestText: sourceText, sourceManifestRepoPath: 'fixture.json' }), /CLASSIFICATION_CODES_SHA256_MISMATCH/)
})

test('rejects declared counts that do not match the exact decisions', () => {
  const { catalogText, source } = fixture()
  source.school_classifications.LVA['6e'] = 2
  source.school_classifications.LVA['5e'] = 0
  const sourceText = `${JSON.stringify(source, null, 2)}\n`
  assert.throws(() => compileSchoolProjection({ catalogText, sourceManifestText: sourceText, sourceManifestRepoPath: 'fixture.json' }), /SCHOOL_COUNT_MISMATCH/)
})
