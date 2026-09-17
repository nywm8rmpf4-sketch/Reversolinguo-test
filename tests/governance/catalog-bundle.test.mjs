import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareCatalogBundle } from '../../tools/prepare-catalog-bundle.mjs'

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'reversolinguo-bundle-'))
  const catalogPath = join(directory, 'catalog.json')
  const projectionPath = join(directory, 'runtime-projection.json')
  const manifestPath = join(directory, 'manifest.json')
  const entry = {
    entry_id: '11111111-1111-5111-8111-111111111111',
    themes: ['identite'],
    status: 'reviewed'
  }
  writeFileSync(catalogPath, `${JSON.stringify([entry], null, 2)}\n`, 'utf8')
  writeFileSync(projectionPath, `${JSON.stringify({
    schema_version: '1.0',
    catalog_id: 'fr-es-a1',
    catalog_version: 'fixture-v1',
    source: { artifact: 'fixture.csv' },
    school_source_assignments: [{ review_id: 'REV-1', entry_id: entry.entry_id, track: 'LVA', grade: '6e', theme: 'identite' }],
    theme_path_assignments: [],
    source_counts: { school: { 'LVA:6e': 1 }, theme_paths: {} }
  }, null, 2)}\n`, 'utf8')
  writeFileSync(manifestPath, `${JSON.stringify({
    catalog_id: 'fr-es-a1',
    catalog_version: 'fixture-v1',
    entry_count: 999,
    catalog_sha256: '0'.repeat(64)
  }, null, 2)}\n`, 'utf8')
  return { catalogPath, projectionPath, manifestPath }
}

test('bundle preparation derives volume and hashes from exact data bytes', () => {
  const data = fixture()
  const prepared = prepareCatalogBundle({ ...data, check: false })
  const manifest = JSON.parse(readFileSync(data.manifestPath, 'utf8'))
  assert.equal(prepared.catalog_entry_count, 1)
  assert.equal(manifest.entry_count, 1)
  assert.equal(manifest.catalog_sha256, prepared.catalog_sha256)
  assert.equal(manifest.projection_sha256, prepared.projection_sha256)
  assert.doesNotThrow(() => prepareCatalogBundle({ ...data, check: true }))
})

test('bundle check fails when a derived manifest field is stale', () => {
  const data = fixture()
  assert.throws(() => prepareCatalogBundle({ ...data, check: true }), /CATALOG_MANIFEST_DERIVED_FIELDS_STALE/)
})

test('bundle preparation rejects unknown projection UUIDs instead of materializing a partial result', () => {
  const data = fixture()
  const projection = JSON.parse(readFileSync(data.projectionPath, 'utf8'))
  projection.school_source_assignments[0].entry_id = '22222222-2222-5222-8222-222222222222'
  writeFileSync(data.projectionPath, `${JSON.stringify(projection, null, 2)}\n`, 'utf8')
  assert.throws(() => prepareCatalogBundle({ ...data, check: false }), /school-unknown-entry/)
})

test('bundle accepts canonical projection themes when the legacy catalogue stores an alias', () => {
  const data = fixture()
  const catalog = JSON.parse(readFileSync(data.catalogPath, 'utf8'))
  catalog[0].themes = ['corps']
  writeFileSync(data.catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  const projection = JSON.parse(readFileSync(data.projectionPath, 'utf8'))
  projection.school_source_assignments[0].theme = 'corps-sante'
  writeFileSync(data.projectionPath, `${JSON.stringify(projection, null, 2)}\n`, 'utf8')
  assert.doesNotThrow(() => prepareCatalogBundle({ ...data, check: false }))
})

test('bundle still rejects a projection theme outside the canonical taxonomy', () => {
  const data = fixture()
  const projection = JSON.parse(readFileSync(data.projectionPath, 'utf8'))
  projection.school_source_assignments[0].theme = 'theme-inconnu'
  writeFileSync(data.projectionPath, `${JSON.stringify(projection, null, 2)}\n`, 'utf8')
  assert.throws(() => prepareCatalogBundle({ ...data, check: false }), /school-unknown-theme/)
})
