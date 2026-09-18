import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')

test('ADR-040 external runtime bundle is hash-bound and level-path independent', () => {
  const catalogText = read('public/catalogs/runtime/catalog.json')
  const projectionText = read('public/catalogs/runtime/runtime-projection.json')
  const manifest = JSON.parse(read('public/catalogs/runtime/manifest.json'))
  const catalog = JSON.parse(catalogText)
  const projection = JSON.parse(projectionText)

  assert.equal(Array.isArray(catalog), true)
  assert.equal(catalog.length, manifest.entry_count)
  assert.equal(sha256(catalogText), manifest.catalog_sha256)
  assert.equal(sha256(projectionText), manifest.projection_sha256)
  assert.equal(projection.catalog_id, manifest.catalog_id)
  assert.equal(projection.catalog_version, manifest.catalog_version)
  assert.equal(Object.keys(projection.prompt_contexts ?? {}).length, 22)
})

test('runtime modules no longer import a CEFR-specific catalog path', () => {
  for (const path of [
    'src/content/catalog.ts',
    'src/content/integrity.ts',
    'src/content/runtimeProjection.ts',
    'src/content/pack6Runtime.ts',
    'src/main.tsx'
  ]) {
    const source = read(path)
    assert.equal(source.includes('catalogs/fr-es/a2'), false, path)
    assert.equal(source.includes('catalogs/fr-es/a1'), false, path)
  }
})

test('PWA precaches external JSON without increasing the ADR-039 ceiling', () => {
  const vite = read('vite.config.ts')
  assert.match(vite, /globPatterns:.*json/u)
  assert.match(vite, /maximumFileSizeToCacheInBytes:\s*3 \* 1024 \* 1024/u)
})
