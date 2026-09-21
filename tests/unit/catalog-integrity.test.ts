import { webcrypto } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { loadVerifiedRuntimeBundleForPair, verifyCatalogBundleIntegrity } from '../../src/content/integrity'

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
    const changedMetadata = JSON.stringify({ ...JSON.parse(manifestText), license: 'internal-test-label' })
    await expect(verify(catalogText, projectionText, changedMetadata)).resolves.toEqual({ ok: true })
  })

  it('rejects an altered catalog while the manifest hash is unchanged', async () => {
    await expect(verify(`${catalogText} `)).resolves.toEqual({ ok: false, reason: 'catalog-hash-mismatch' })
  })

  it('rejects an altered projection while the manifest hash is unchanged', async () => {
    await expect(verify(catalogText, `${projectionText} `)).resolves.toEqual({ ok: false, reason: 'projection-hash-mismatch' })
  })

  it('rejects a malformed catalog hash in the manifest', async () => {
    const invalid = JSON.stringify({ ...JSON.parse(manifestText), catalog_sha256: 'invalid' })
    await expect(verify(catalogText, projectionText, invalid)).resolves.toEqual({ ok: false, reason: 'invalid-manifest' })
  })
})


describe('pair-aware runtime bundle loading', () => {
  it('requests the isolated path for the selected pair and registers verified bytes', async () => {
    const requested: string[] = []
    const pairManifestText = JSON.stringify({ ...JSON.parse(manifestText), source_language: 'es', target_language: 'fr' })
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input); requested.push(url)
      const body = url.endsWith('/catalog.json') ? catalogText : url.endsWith('/runtime-projection.json') ? projectionText : pairManifestText
      return new Response(body, { status: 200 })
    }) as typeof fetch
    await expect(loadVerifiedRuntimeBundleForPair('fr-es', fetcher, subtle, 'https://example.test/app/')).resolves.toEqual({ ok: true })
    expect(requested).toEqual([
      'https://example.test/app/catalogs/runtime/fr-es/catalog.json',
      'https://example.test/app/catalogs/runtime/fr-es/runtime-projection.json',
      'https://example.test/app/catalogs/runtime/fr-es/manifest.json'
    ])
  })

  it('rejects an unsafe or malformed pair id before network access', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch
    await expect(loadVerifiedRuntimeBundleForPair('../fr-es', fetcher, subtle, 'https://example.test/app/')).resolves.toEqual({ ok: false, reason: 'payload-contract-invalid' })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
