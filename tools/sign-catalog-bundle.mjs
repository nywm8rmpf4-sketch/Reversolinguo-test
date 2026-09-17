#!/usr/bin/env node

import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DEFAULT_PINNED_KEY = resolve(ROOT, 'src/content/catalogSigningKey.ts')

function scalar(value) {
  return String(value ?? '').trim()
}

export function readPinnedCatalogSigningKey(path = DEFAULT_PINNED_KEY) {
  const text = readFileSync(path, 'utf8')
  const keyId = /catalogSigningKeyId\s*=\s*'([^']+)'/u.exec(text)?.[1]
  const kty = /kty:\s*'([^']+)'/u.exec(text)?.[1]
  const crv = /crv:\s*'([^']+)'/u.exec(text)?.[1]
  const x = /x:\s*'([^']+)'/u.exec(text)?.[1]
  const y = /y:\s*'([^']+)'/u.exec(text)?.[1]
  if (!keyId || !kty || !crv || !x || !y) throw new Error('PINNED_PUBLIC_KEY_PARSE_FAIL')
  return { key_id: keyId, jwk: { kty, crv, x, y, ext: true, key_ops: ['verify'] } }
}

function samePublicKey(left, right) {
  return left.kty === right.kty && left.crv === right.crv && left.x === right.x && left.y === right.y
}

export function signManifestText(manifestText, privateJwk, pinned) {
  if (!privateJwk || privateJwk.kty !== 'EC' || privateJwk.crv !== 'P-256' || !privateJwk.d) {
    throw new Error('PRIVATE_KEY_INVALID_OR_MISSING')
  }
  const privateKey = createPrivateKey({ key: privateJwk, format: 'jwk' })
  const derivedPublic = createPublicKey(privateKey).export({ format: 'jwk' })
  if (!samePublicKey(derivedPublic, pinned.jwk)) throw new Error('PRIVATE_KEY_DOES_NOT_MATCH_PINNED_PUBLIC_KEY')

  const signature = sign('sha256', Buffer.from(manifestText, 'utf8'), { key: privateKey, dsaEncoding: 'ieee-p1363' })
  if (signature.length !== 64) throw new Error(`SIGNATURE_LENGTH_INVALID:${signature.length}`)
  if (!verify('sha256', Buffer.from(manifestText, 'utf8'), { key: createPublicKey(privateKey), dsaEncoding: 'ieee-p1363' }, signature)) {
    throw new Error('SIGNATURE_SELF_CHECK_FAIL')
  }
  return {
    key_id: pinned.key_id,
    algorithm: 'ECDSA-P256-SHA256',
    signature_base64: signature.toString('base64')
  }
}

export function signManifestFile({ manifestPath, signaturePath, privateKeyPath, pinnedKeyPath = DEFAULT_PINNED_KEY }) {
  if (!scalar(privateKeyPath)) throw new Error('PRIVATE_KEY_PATH_REQUIRED')
  const manifestText = readFileSync(manifestPath, 'utf8')
  const privateJwk = JSON.parse(readFileSync(privateKeyPath, 'utf8'))
  const pinned = readPinnedCatalogSigningKey(pinnedKeyPath)
  const signatureDocument = signManifestText(manifestText, privateJwk, pinned)
  writeFileSync(signaturePath, `${JSON.stringify(signatureDocument, null, 2)}\n`, 'utf8')
  return signatureDocument
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
  if (!args.manifest || !args.signature || !args['private-key']) {
    throw new Error('USAGE: --manifest <path> --signature <path> --private-key <outside-repo-path> [--pinned-key <path>]')
  }
  const result = signManifestFile({
    manifestPath: resolve(ROOT, args.manifest),
    signaturePath: resolve(ROOT, args.signature),
    privateKeyPath: resolve(args['private-key']),
    pinnedKeyPath: args['pinned-key'] ? resolve(ROOT, args['pinned-key']) : DEFAULT_PINNED_KEY
  })
  process.stdout.write(`${JSON.stringify({ result: 'PASS', key_id: result.key_id, algorithm: result.algorithm })}\n`)
}

const invokedAsScript = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedAsScript) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`CATALOG_SIGNING_FAIL: ${error.message}\n`)
    process.exitCode = 2
  }
}
