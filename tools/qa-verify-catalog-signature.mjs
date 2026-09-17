#!/usr/bin/env node

import { createPublicKey, verify } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DEFAULT_PINNED_KEY = resolve(ROOT, 'src/content/catalogSigningKey.ts')

function parsePinnedPublicKey(path = DEFAULT_PINNED_KEY) {
  const text = readFileSync(path, 'utf8')
  const keyId = /catalogSigningKeyId\s*=\s*'([^']+)'/u.exec(text)?.[1]
  const kty = /\bkty:\s*'([^']+)'/u.exec(text)?.[1]
  const crv = /\bcrv:\s*'([^']+)'/u.exec(text)?.[1]
  const x = /\bx:\s*'([^']+)'/u.exec(text)?.[1]
  const y = /\by:\s*'([^']+)'/u.exec(text)?.[1]
  if (!keyId || !kty || !crv || !x || !y) throw new Error('PINNED_PUBLIC_KEY_PARSE_FAIL')
  return { key_id: keyId, jwk: { kty, crv, x, y, ext: true, key_ops: ['verify'] } }
}

function validP256PublicJwk(jwk) {
  return jwk && jwk.kty === 'EC' && jwk.crv === 'P-256' && typeof jwk.x === 'string' && typeof jwk.y === 'string'
}

export function verifyCatalogManifestSignature({ manifestText, signatureText, pinnedKeyPath = DEFAULT_PINNED_KEY }) {
  let manifest
  let signatureDocument
  try { manifest = JSON.parse(manifestText) } catch { throw new Error('MANIFEST_JSON_INVALID') }
  try { signatureDocument = JSON.parse(signatureText) } catch { throw new Error('SIGNATURE_JSON_INVALID') }

  if (signatureDocument.algorithm !== 'ECDSA-P256-SHA256') throw new Error('SIGNATURE_ALGORITHM_INVALID')
  if (typeof signatureDocument.key_id !== 'string' || signatureDocument.key_id.length === 0) throw new Error('SIGNATURE_KEY_ID_MISSING')
  if (typeof signatureDocument.signature_base64 !== 'string' || signatureDocument.signature_base64.length === 0) throw new Error('SIGNATURE_VALUE_MISSING')

  let publicJwk
  if (signatureDocument.test_only === true) {
    if (typeof manifest.catalog_id !== 'string' || !manifest.catalog_id.startsWith('qa-fixture-')) {
      throw new Error('TEST_KEY_FOR_NON_FIXTURE_CATALOG')
    }
    if (!signatureDocument.key_id.startsWith('test-only-')) throw new Error('TEST_KEY_ID_INVALID')
    if (!validP256PublicJwk(signatureDocument.test_public_jwk)) throw new Error('TEST_PUBLIC_KEY_INVALID')
    publicJwk = signatureDocument.test_public_jwk
  } else {
    if (signatureDocument.test_public_jwk !== undefined || signatureDocument.test_only !== undefined) {
      throw new Error('TEST_KEY_METADATA_FOR_PRODUCT_CATALOG')
    }
    const pinned = parsePinnedPublicKey(pinnedKeyPath)
    if (signatureDocument.key_id !== pinned.key_id) throw new Error('SIGNATURE_KEY_ID_MISMATCH')
    publicJwk = pinned.jwk
  }

  const signature = Buffer.from(signatureDocument.signature_base64, 'base64')
  if (signature.length !== 64) throw new Error(`SIGNATURE_LENGTH_INVALID:${signature.length}`)
  const key = createPublicKey({ key: publicJwk, format: 'jwk' })
  const valid = verify('sha256', Buffer.from(manifestText, 'utf8'), { key, dsaEncoding: 'ieee-p1363' }, signature)
  if (!valid) throw new Error('SIGNATURE_VERIFY_FAIL')
  return { valid: true, key_id: signatureDocument.key_id, test_only: signatureDocument.test_only === true }
}

function parseArgs(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) throw new Error(`UNEXPECTED_ARGUMENT:${token}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`MISSING_ARGUMENT_VALUE:${token}`)
    values[token.slice(2)] = value
    index += 1
  }
  return values
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.manifest || !args.signature) throw new Error('USAGE: --manifest <path> --signature <path> [--pinned-key <path>]')
  const manifestText = readFileSync(resolve(ROOT, args.manifest), 'utf8')
  const signatureText = readFileSync(resolve(ROOT, args.signature), 'utf8')
  const result = verifyCatalogManifestSignature({
    manifestText,
    signatureText,
    pinnedKeyPath: args['pinned-key'] ? resolve(ROOT, args['pinned-key']) : DEFAULT_PINNED_KEY
  })
  process.stdout.write(`${JSON.stringify({ result: 'PASS', key_id: result.key_id, test_only: result.test_only })}\n`)
}

const invokedAsScript = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedAsScript) {
  try { main() } catch (error) {
    process.stderr.write(`CATALOG_SIGNATURE_VERIFY_FAIL: ${error.message}\n`)
    process.exitCode = 2
  }
}
