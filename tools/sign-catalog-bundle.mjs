#!/usr/bin/env node

import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DEFAULT_PINNED_KEY = resolve(ROOT, 'src/content/catalogSigningKey.ts')
const DEFAULT_SECRET_NAME = 'REVERSOLINGUO_CATALOG_SIGNING_KEY'

function scalar(value) {
  return String(value ?? '').trim()
}

export function parsePrivateJwkText(text) {
  const value = scalar(text)
  if (!value) throw new Error('PRIVATE_KEY_INVALID_OR_MISSING')
  let privateJwk
  try {
    privateJwk = JSON.parse(value)
  } catch {
    throw new Error('PRIVATE_KEY_JSON_INVALID')
  }
  if (
    !privateJwk ||
    privateJwk.kty !== 'EC' ||
    privateJwk.crv !== 'P-256' ||
    !scalar(privateJwk.x) ||
    !scalar(privateJwk.y) ||
    !scalar(privateJwk.d)
  ) {
    throw new Error('PRIVATE_KEY_INVALID_OR_MISSING')
  }
  return privateJwk
}

export function privateKeyTextFromEnvironment(name = DEFAULT_SECRET_NAME, env = process.env) {
  const secretName = scalar(name)
  if (!secretName) throw new Error('PRIVATE_KEY_ENV_NAME_REQUIRED')
  const value = env?.[secretName]
  if (!scalar(value)) throw new Error(`PRIVATE_KEY_ENV_MISSING:${secretName}`)
  return value
}

export function readPinnedCatalogSigningKey(path = DEFAULT_PINNED_KEY) {
  const text = readFileSync(path, 'utf8')
  const keyId = /catalogSigningKeyId\s*=\s*'([^']+)'/u.exec(text)?.[1]
  const kty = /\bkty:\s*'([^']+)'/u.exec(text)?.[1]
  const crv = /\bcrv:\s*'([^']+)'/u.exec(text)?.[1]
  const x = /\bx:\s*'([^']+)'/u.exec(text)?.[1]
  const y = /\by:\s*'([^']+)'/u.exec(text)?.[1]
  if (!keyId || !kty || !crv || !x || !y) throw new Error('PINNED_PUBLIC_KEY_PARSE_FAIL')
  return { key_id: keyId, jwk: { kty, crv, x, y, ext: true, key_ops: ['verify'] } }
}

function samePublicKey(left, right) {
  return left.kty === right.kty && left.crv === right.crv && left.x === right.x && left.y === right.y
}

export function derivePinnedCatalogSigningKey(privateJwk, keyId) {
  const normalizedPrivateJwk = parsePrivateJwkText(JSON.stringify(privateJwk))
  const normalizedKeyId = scalar(keyId)
  if (!normalizedKeyId) throw new Error('KEY_ID_REQUIRED')
  const privateKey = createPrivateKey({ key: normalizedPrivateJwk, format: 'jwk' })
  const derivedPublic = createPublicKey(privateKey).export({ format: 'jwk' })
  if (derivedPublic.kty !== 'EC' || derivedPublic.crv !== 'P-256' || !derivedPublic.x || !derivedPublic.y) {
    throw new Error('DERIVED_PUBLIC_KEY_INVALID')
  }
  return {
    key_id: normalizedKeyId,
    jwk: {
      kty: 'EC',
      crv: 'P-256',
      x: derivedPublic.x,
      y: derivedPublic.y,
      ext: true,
      key_ops: ['verify']
    }
  }
}

export function renderPinnedCatalogSigningKeyTs(pinned) {
  if (!pinned?.key_id || !pinned?.jwk?.x || !pinned?.jwk?.y || pinned.jwk.kty !== 'EC' || pinned.jwk.crv !== 'P-256') {
    throw new Error('PINNED_PUBLIC_KEY_INVALID')
  }
  return `export const catalogSigningKeyId = '${pinned.key_id}'\n\nexport const catalogSigningPublicJwk: JsonWebKey = {\n  kty: 'EC',\n  crv: 'P-256',\n  x: '${pinned.jwk.x}',\n  y: '${pinned.jwk.y}',\n  ext: true,\n  key_ops: ['verify']\n}\n`
}

export function signManifestText(manifestText, privateJwk, pinned) {
  const normalizedPrivateJwk = parsePrivateJwkText(JSON.stringify(privateJwk))
  const privateKey = createPrivateKey({ key: normalizedPrivateJwk, format: 'jwk' })
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

export function signManifestFile({ manifestPath, signaturePath, privateKeyPath, privateKeyText, pinnedKeyPath = DEFAULT_PINNED_KEY }) {
  const manifestText = readFileSync(manifestPath, 'utf8')
  let rawPrivateKey = privateKeyText
  if (!scalar(rawPrivateKey) && scalar(privateKeyPath)) rawPrivateKey = readFileSync(privateKeyPath, 'utf8')
  if (!scalar(rawPrivateKey)) throw new Error('PRIVATE_KEY_REQUIRED')
  const privateJwk = parsePrivateJwkText(rawPrivateKey)
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
  if (!args.manifest || !args.signature || (!args['private-key'] && !args['private-key-env'])) {
    throw new Error('USAGE: --manifest <path> --signature <path> (--private-key <outside-repo-path> | --private-key-env <secret-name>) [--pinned-key <path>]')
  }
  if (args['private-key'] && args['private-key-env']) throw new Error('PRIVATE_KEY_SOURCE_AMBIGUOUS')
  const privateKeyText = args['private-key-env'] ? privateKeyTextFromEnvironment(args['private-key-env']) : undefined
  const result = signManifestFile({
    manifestPath: resolve(ROOT, args.manifest),
    signaturePath: resolve(ROOT, args.signature),
    privateKeyPath: args['private-key'] ? resolve(args['private-key']) : undefined,
    privateKeyText,
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
