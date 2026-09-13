import { webcrypto } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import catalogText from '../../catalogs/fr-es/a1/catalog.json?raw'
import manifestText from '../../catalogs/fr-es/a1/manifest.json?raw'
import signatureData from '../../catalogs/fr-es/a1/manifest.sig.json'
import { catalogSigningKeyId, catalogSigningPublicJwk } from '../../src/content/catalogSigningKey'
import { verifyCatalogIntegrity, type CatalogSignature } from '../../src/content/integrity'

const subtle = webcrypto.subtle as unknown as SubtleCrypto
const signature = signatureData as CatalogSignature

async function verify(catalog = catalogText, manifest = manifestText, candidateSignature: CatalogSignature = signature) {
  return verifyCatalogIntegrity(
    catalog,
    manifest,
    candidateSignature,
    catalogSigningPublicJwk,
    catalogSigningKeyId,
    subtle
  )
}

describe('signed catalog integrity', () => {
  it('accepts the exact signed manifest and catalog', async () => {
    await expect(verify()).resolves.toEqual({ ok: true })
    expect(catalogSigningPublicJwk).not.toHaveProperty('d')
  })

  it('rejects a one-field manifest alteration', async () => {
    const tampered = manifestText.replace('"license": "CC BY 4.0"', '"license": "tampered"')
    await expect(verify(catalogText, tampered)).resolves.toEqual({ ok: false, reason: 'signature-invalid' })
  })

  it('rejects an altered catalog while the signed manifest is unchanged', async () => {
    await expect(verify(`${catalogText} `)).resolves.toEqual({ ok: false, reason: 'catalog-hash-mismatch' })
  })

  it('rejects an unexpected signing key identity', async () => {
    await expect(verify(catalogText, manifestText, { ...signature, key_id: 'unexpected-key' })).resolves.toEqual({ ok: false, reason: 'signature-metadata' })
  })
})
