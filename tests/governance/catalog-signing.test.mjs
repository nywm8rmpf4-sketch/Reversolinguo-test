import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, verify } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  derivePinnedCatalogSigningKey,
  parsePrivateJwkText,
  privateKeyTextFromEnvironment,
  renderPinnedCatalogSigningKeyTs,
  signManifestFile
} from '../../tools/sign-catalog-bundle.mjs'
import { provisionCatalogSigningAuthority } from '../../tools/provision-catalog-signing-authority.mjs'

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'reversolinguo-signing-'))
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const privateJwk = privateKey.export({ format: 'jwk' })
  const publicJwk = publicKey.export({ format: 'jwk' })
  const manifestPath = join(directory, 'manifest.json')
  const signaturePath = join(directory, 'manifest.sig.json')
  const privateKeyPath = join(directory, 'private-key.test.json')
  const pinnedKeyPath = join(directory, 'catalogSigningKey.ts')
  const provisionedKeyPath = join(directory, 'catalogSigningKey.provisioned.ts')
  const provisionedSignaturePath = join(directory, 'manifest.provisioned.sig.json')
  const manifestText = '{"catalog_sha256":"' + 'a'.repeat(64) + '","projection_sha256":"' + 'b'.repeat(64) + '"}\n'
  writeFileSync(manifestPath, manifestText, 'utf8')
  writeFileSync(privateKeyPath, JSON.stringify(privateJwk), 'utf8')
  writeFileSync(pinnedKeyPath, `export const catalogSigningKeyId = 'fixture-key'\nexport const catalogSigningPublicJwk = { kty: '${publicJwk.kty}', crv: '${publicJwk.crv}', x: '${publicJwk.x}', y: '${publicJwk.y}' }\n`, 'utf8')
  return {
    directory,
    manifestPath,
    signaturePath,
    privateKeyPath,
    pinnedKeyPath,
    provisionedKeyPath,
    provisionedSignaturePath,
    manifestText,
    privateJwk,
    publicJwk,
    publicKey
  }
}

test('catalog signer uses an explicitly supplied private key matching the pinned trust anchor', () => {
  const data = fixture()
  const result = signManifestFile(data)
  assert.equal(result.key_id, 'fixture-key')
  assert.equal(result.algorithm, 'ECDSA-P256-SHA256')
  const signature = JSON.parse(readFileSync(data.signaturePath, 'utf8'))
  assert.equal(signature.key_id, 'fixture-key')
  assert.equal(verify('sha256', Buffer.from(data.manifestText), { key: data.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature.signature_base64, 'base64')), true)
})

test('catalog signer accepts private key bytes directly for CI secret use', () => {
  const data = fixture()
  const result = signManifestFile({
    manifestPath: data.manifestPath,
    signaturePath: data.signaturePath,
    privateKeyText: JSON.stringify(data.privateJwk),
    pinnedKeyPath: data.pinnedKeyPath
  })
  assert.equal(result.key_id, 'fixture-key')
  assert.equal(result.algorithm, 'ECDSA-P256-SHA256')
})

test('catalog signer fails closed when the supplied private key does not match the pinned public key', () => {
  const data = fixture()
  const other = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'jwk' })
  writeFileSync(data.privateKeyPath, JSON.stringify(other), 'utf8')
  assert.throws(() => signManifestFile(data), /PRIVATE_KEY_DOES_NOT_MATCH_PINNED_PUBLIC_KEY/)
})

test('catalog signer requires an explicit private-key source', () => {
  const data = fixture()
  assert.throws(
    () => signManifestFile({ manifestPath: data.manifestPath, signaturePath: data.signaturePath, pinnedKeyPath: data.pinnedKeyPath }),
    /PRIVATE_KEY_REQUIRED/
  )
})

test('CI secret loader fails closed when the configured secret is absent', () => {
  assert.throws(() => privateKeyTextFromEnvironment('REVERSOLINGUO_CATALOG_SIGNING_KEY', {}), /PRIVATE_KEY_ENV_MISSING/)
})

test('private JWK parser rejects wrong curves and malformed secrets', () => {
  const p384 = generateKeyPairSync('ec', { namedCurve: 'secp384r1' }).privateKey.export({ format: 'jwk' })
  assert.throws(() => parsePrivateJwkText(JSON.stringify(p384)), /PRIVATE_KEY_INVALID_OR_MISSING/)
  assert.throws(() => parsePrivateJwkText('{not-json'), /PRIVATE_KEY_JSON_INVALID/)
})

test('derived pinned trust anchor contains public material only', () => {
  const data = fixture()
  const pinned = derivePinnedCatalogSigningKey(data.privateJwk, 'fixture-stable-k6')
  const rendered = renderPinnedCatalogSigningKeyTs(pinned)
  assert.equal(pinned.key_id, 'fixture-stable-k6')
  assert.equal(pinned.jwk.x, data.publicJwk.x)
  assert.equal(pinned.jwk.y, data.publicJwk.y)
  assert.equal('d' in pinned.jwk, false)
  assert.equal(rendered.includes(data.privateJwk.d), false)
  assert.equal(/\bd\s*:/u.test(rendered), false)
})

test('authority provisioning writes only public anchor and verifiable detached signature', () => {
  const data = fixture()
  const result = provisionCatalogSigningAuthority({
    manifestText: data.manifestText,
    privateKeyText: JSON.stringify(data.privateJwk),
    keyId: 'fixture-stable-k6',
    publicKeyOutputPath: data.provisionedKeyPath,
    signatureOutputPath: data.provisionedSignaturePath
  })
  assert.equal(result.key_id, 'fixture-stable-k6')
  assert.equal(result.signature_algorithm, 'ECDSA-P256-SHA256')

  const publicKeyOutput = readFileSync(data.provisionedKeyPath, 'utf8')
  const signature = JSON.parse(readFileSync(data.provisionedSignaturePath, 'utf8'))
  assert.equal(publicKeyOutput.includes(data.privateJwk.d), false)
  assert.equal(/\bd\s*:/u.test(publicKeyOutput), false)
  assert.equal(signature.key_id, 'fixture-stable-k6')
  assert.equal(JSON.stringify(signature).includes(data.privateJwk.d), false)
  assert.equal(verify('sha256', Buffer.from(data.manifestText), { key: data.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature.signature_base64, 'base64')), true)
})
