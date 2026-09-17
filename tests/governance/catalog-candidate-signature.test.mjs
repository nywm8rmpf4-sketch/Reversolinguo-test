import assert from 'node:assert/strict'
import { createPublicKey, generateKeyPairSync, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { verifyCatalogManifestSignature } from '../../tools/qa-verify-catalog-signature.mjs'

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))

function makeTestSignature(manifestText, catalogId = 'qa-fixture-fr-es-a1-60') {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const publicJwk = createPublicKey(privateKey).export({ format: 'jwk' })
  const signature = sign('sha256', Buffer.from(manifestText, 'utf8'), { key: privateKey, dsaEncoding: 'ieee-p1363' })
  return {
    catalogId,
    document: {
      key_id: 'test-only-data-candidate-r1',
      algorithm: 'ECDSA-P256-SHA256',
      signature_base64: signature.toString('base64'),
      test_only: true,
      test_public_jwk: publicJwk
    }
  }
}

test('verifies the currently pinned product catalogue signature', () => {
  const manifestText = readFileSync(resolve(ROOT, 'catalogs/fr-es/a1/manifest.json'), 'utf8')
  const signatureText = readFileSync(resolve(ROOT, 'catalogs/fr-es/a1/manifest.sig.json'), 'utf8')
  const result = verifyCatalogManifestSignature({ manifestText, signatureText })
  assert.equal(result.valid, true)
  assert.equal(result.test_only, false)
})

test('accepts a P-256 test-only signature only for an explicit QA fixture catalogue', () => {
  const manifestText = `${JSON.stringify({ catalog_id: 'qa-fixture-fr-es-a1-60', catalog_version: 'test-r1' }, null, 2)}\n`
  const { document } = makeTestSignature(manifestText)
  const result = verifyCatalogManifestSignature({ manifestText, signatureText: `${JSON.stringify(document, null, 2)}\n` })
  assert.equal(result.valid, true)
  assert.equal(result.test_only, true)
})

test('rejects a tampered manifest', () => {
  const manifestText = `${JSON.stringify({ catalog_id: 'qa-fixture-fr-es-a1-60', catalog_version: 'test-r1' }, null, 2)}\n`
  const { document } = makeTestSignature(manifestText)
  const tampered = `${JSON.stringify({ catalog_id: 'qa-fixture-fr-es-a1-60', catalog_version: 'test-r2' }, null, 2)}\n`
  assert.throws(
    () => verifyCatalogManifestSignature({ manifestText: tampered, signatureText: `${JSON.stringify(document, null, 2)}\n` }),
    /SIGNATURE_VERIFY_FAIL/
  )
})

test('rejects test-only key metadata on a product catalogue id', () => {
  const manifestText = `${JSON.stringify({ catalog_id: 'fr-es-a1', catalog_version: 'test-r1' }, null, 2)}\n`
  const { document } = makeTestSignature(manifestText, 'fr-es-a1')
  assert.throws(
    () => verifyCatalogManifestSignature({ manifestText, signatureText: `${JSON.stringify(document, null, 2)}\n` }),
    /TEST_KEY_FOR_NON_FIXTURE_CATALOG/
  )
})
