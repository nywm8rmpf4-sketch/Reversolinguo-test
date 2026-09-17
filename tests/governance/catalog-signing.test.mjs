import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, verify } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { signManifestFile } from '../../tools/sign-catalog-bundle.mjs'

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'reversolinguo-signing-'))
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const privateJwk = privateKey.export({ format: 'jwk' })
  const publicJwk = publicKey.export({ format: 'jwk' })
  const manifestPath = join(directory, 'manifest.json')
  const signaturePath = join(directory, 'manifest.sig.json')
  const privateKeyPath = join(directory, 'private-key.test.json')
  const pinnedKeyPath = join(directory, 'catalogSigningKey.ts')
  const manifestText = '{"catalog_sha256":"' + 'a'.repeat(64) + '","projection_sha256":"' + 'b'.repeat(64) + '"}\n'
  writeFileSync(manifestPath, manifestText, 'utf8')
  writeFileSync(privateKeyPath, JSON.stringify(privateJwk), 'utf8')
  writeFileSync(pinnedKeyPath, `export const catalogSigningKeyId = 'fixture-key'\nexport const catalogSigningPublicJwk = { kty: '${publicJwk.kty}', crv: '${publicJwk.crv}', x: '${publicJwk.x}', y: '${publicJwk.y}' }\n`, 'utf8')
  return { manifestPath, signaturePath, privateKeyPath, pinnedKeyPath, manifestText, publicKey }
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

test('catalog signer fails closed when the supplied private key does not match the pinned public key', () => {
  const data = fixture()
  const other = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'jwk' })
  writeFileSync(data.privateKeyPath, JSON.stringify(other), 'utf8')
  assert.throws(() => signManifestFile(data), /PRIVATE_KEY_DOES_NOT_MATCH_PINNED_PUBLIC_KEY/)
})

test('catalog signer requires an explicit external private-key path', () => {
  const data = fixture()
  assert.throws(() => signManifestFile({ ...data, privateKeyPath: '' }), /PRIVATE_KEY_PATH_REQUIRED/)
})
