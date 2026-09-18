import { webcrypto } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { verifyCatalogBundleIntegrity } from '../../src/content/integrity'

const subtle = webcrypto.subtle as unknown as SubtleCrypto

function runtimeText(name: string): string {
  return readFileSync(resolve(process.cwd(), 'public/catalogs/runtime', name), 'utf8')
}

const catalogText = runtimeText('catalog.json')
const manifestText = runtimeText('manifest.json')
const projectionText = runtimeText('runtime-projection.json')

async function verify(catalog = catalogText, projection = projectionText, manifest = manifestText) {
  return verifyCatalogBundleIntegrity(catalog, projection, manifest, subtle)
}

describe('catalog manifest hash integrity', () => {
  it('accepts the exact external manifest, catalog and projection bytes', async () => {
    await expect(verify()).resolves.toEqual({ ok: true })
  })

  it('accepts a non-integrity manifest metadata change when hashes remain exact', async () => {
    const changedMetadata = manifestText.replace('"license": "CC BY 4.0"', '"license": "internal-test-label"')
    await expect(verify(catalogText, projectionText, changedMetadata)).resolves.toEqual({ ok: true })
  })

  it('rejects an altered catalog while the manifest hash is unchanged', async () => {
    await expect(verify(`${catalogText} `)).resolves.toEqual({ ok: false, reason: 'catalog-hash-mismatch' })
  })

  it('rejects an altered projection while the manifest hash is unchanged', async () => {
    await expect(verify(catalogText, `${projectionText} `)).resolves.toEqual({ ok: false, reason: 'projection-hash-mismatch' })
  })

  it('rejects a malformed catalog hash in the manifest', async () => {
    const invalid = manifestText.replace(/"catalog_sha256": "[0-9a-f]{64}"/u, '"catalog_sha256": "invalid"')
    await expect(verify(catalogText, projectionText, invalid)).resolves.toEqual({ ok: false, reason: 'invalid-manifest' })
  })
})
