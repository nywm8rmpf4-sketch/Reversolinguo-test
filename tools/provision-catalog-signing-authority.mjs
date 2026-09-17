#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  derivePinnedCatalogSigningKey,
  parsePrivateJwkText,
  privateKeyTextFromEnvironment,
  renderPinnedCatalogSigningKeyTs,
  signManifestText
} from './sign-catalog-bundle.mjs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DEFAULT_SECRET_NAME = 'REVERSOLINGUO_CATALOG_SIGNING_KEY'

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export function provisionCatalogSigningAuthority({
  manifestText,
  privateKeyText,
  keyId,
  publicKeyOutputPath,
  signatureOutputPath
}) {
  const privateJwk = parsePrivateJwkText(privateKeyText)
  const pinned = derivePinnedCatalogSigningKey(privateJwk, keyId)
  const publicKeyText = renderPinnedCatalogSigningKeyTs(pinned)
  if (/\bd\s*:/u.test(publicKeyText) || publicKeyText.includes(privateJwk.d)) {
    throw new Error('PRIVATE_KEY_MATERIAL_IN_PUBLIC_OUTPUT')
  }
  const signatureDocument = signManifestText(manifestText, privateJwk, pinned)
  const signatureText = `${JSON.stringify(signatureDocument, null, 2)}\n`
  if (signatureText.includes(privateJwk.d)) throw new Error('PRIVATE_KEY_MATERIAL_IN_SIGNATURE_OUTPUT')
  writeFileSync(publicKeyOutputPath, publicKeyText, 'utf8')
  writeFileSync(signatureOutputPath, signatureText, 'utf8')
  return {
    key_id: pinned.key_id,
    public_key_sha256: sha256(JSON.stringify({ kty: pinned.jwk.kty, crv: pinned.jwk.crv, x: pinned.jwk.x, y: pinned.jwk.y })),
    signature_algorithm: signatureDocument.algorithm
  }
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
  if (!args.manifest || !args.signature || !args['public-key-output'] || !args['key-id']) {
    throw new Error('USAGE: --manifest <path> --signature <path> --public-key-output <path> --key-id <id> [--private-key-env <secret-name>]')
  }
  const secretName = args['private-key-env'] ?? DEFAULT_SECRET_NAME
  const privateKeyText = privateKeyTextFromEnvironment(secretName)
  const result = provisionCatalogSigningAuthority({
    manifestText: readFileSync(resolve(ROOT, args.manifest), 'utf8'),
    privateKeyText,
    keyId: args['key-id'],
    publicKeyOutputPath: resolve(ROOT, args['public-key-output']),
    signatureOutputPath: resolve(ROOT, args.signature)
  })
  process.stdout.write(`${JSON.stringify({ result: 'PASS', ...result })}\n`)
}

const invokedAsScript = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedAsScript) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`CATALOG_AUTHORITY_PROVISION_FAIL: ${error.message}\n`)
    process.exitCode = 2
  }
}
