import catalogText from '../../catalogs/fr-es/a1/catalog.json?raw'
import manifestText from '../../catalogs/fr-es/a1/manifest.json?raw'
import projectionText from '../../catalogs/fr-es/a1/runtime-projection.json?raw'
import signatureData from '../../catalogs/fr-es/a1/manifest.sig.json'
import { catalogSigningKeyId, catalogSigningPublicJwk } from './catalogSigningKey'

export interface CatalogSignature {
  key_id: string
  algorithm: string
  signature_base64: string
}

interface SignedManifest {
  catalog_sha256: string
  projection_sha256?: string
}

export interface CatalogIntegrityResult {
  ok: boolean
  reason?:
    | 'signature-metadata'
    | 'signature-invalid'
    | 'catalog-hash-mismatch'
    | 'projection-hash-missing'
    | 'projection-required'
    | 'projection-hash-mismatch'
    | 'invalid-manifest'
    | 'crypto-error'
}

const encoder = new TextEncoder()

function decodeBase64(value: string): ArrayBuffer {
  const decoded = atob(value)
  const buffer = new ArrayBuffer(decoded.length)
  const bytes = new Uint8Array(buffer)
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index)
  return buffer
}

async function sha256Hex(value: string, subtle: SubtleCrypto): Promise<string> {
  const digest = await subtle.digest('SHA-256', encoder.encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function parseSignedManifest(candidateManifestText: string): SignedManifest | undefined {
  try {
    const manifest = JSON.parse(candidateManifestText) as SignedManifest
    if (typeof manifest.catalog_sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(manifest.catalog_sha256)) return undefined
    if (manifest.projection_sha256 !== undefined && !/^[0-9a-f]{64}$/u.test(manifest.projection_sha256)) return undefined
    return manifest
  } catch {
    return undefined
  }
}

async function verifySignedCatalogPayload(
  candidateCatalogText: string,
  candidateManifestText: string,
  signature: CatalogSignature,
  publicJwk: JsonWebKey,
  expectedKeyId: string,
  subtle: SubtleCrypto,
  candidateProjectionText?: string,
  projectionRequired = false
): Promise<CatalogIntegrityResult> {
  if (signature.key_id !== expectedKeyId || signature.algorithm !== 'ECDSA-P256-SHA256') {
    return { ok: false, reason: 'signature-metadata' }
  }

  const manifest = parseSignedManifest(candidateManifestText)
  if (!manifest) return { ok: false, reason: 'invalid-manifest' }
  if (projectionRequired && manifest.projection_sha256 === undefined) return { ok: false, reason: 'projection-hash-missing' }
  if (manifest.projection_sha256 !== undefined && candidateProjectionText === undefined) return { ok: false, reason: 'projection-required' }

  try {
    const key = await subtle.importKey(
      'jwk',
      publicJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    )
    const signatureValid = await subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      decodeBase64(signature.signature_base64),
      encoder.encode(candidateManifestText)
    )
    if (!signatureValid) return { ok: false, reason: 'signature-invalid' }

    const actualCatalogHash = await sha256Hex(candidateCatalogText, subtle)
    if (actualCatalogHash !== manifest.catalog_sha256) return { ok: false, reason: 'catalog-hash-mismatch' }

    if (manifest.projection_sha256 !== undefined && candidateProjectionText !== undefined) {
      const actualProjectionHash = await sha256Hex(candidateProjectionText, subtle)
      if (actualProjectionHash !== manifest.projection_sha256) return { ok: false, reason: 'projection-hash-mismatch' }
    }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'crypto-error' }
  }
}

export function verifyCatalogIntegrity(
  candidateCatalogText: string,
  candidateManifestText: string,
  signature: CatalogSignature,
  publicJwk: JsonWebKey,
  expectedKeyId: string,
  subtle: SubtleCrypto
): Promise<CatalogIntegrityResult> {
  return verifySignedCatalogPayload(candidateCatalogText, candidateManifestText, signature, publicJwk, expectedKeyId, subtle)
}

export function verifyCatalogBundleIntegrity(
  candidateCatalogText: string,
  candidateProjectionText: string,
  candidateManifestText: string,
  signature: CatalogSignature,
  publicJwk: JsonWebKey,
  expectedKeyId: string,
  subtle: SubtleCrypto
): Promise<CatalogIntegrityResult> {
  return verifySignedCatalogPayload(
    candidateCatalogText,
    candidateManifestText,
    signature,
    publicJwk,
    expectedKeyId,
    subtle,
    candidateProjectionText,
    true
  )
}

export function verifyBundledCatalogIntegrity(): Promise<CatalogIntegrityResult> {
  const manifest = JSON.parse(manifestText) as SignedManifest
  if (manifest.projection_sha256 !== undefined) {
    return verifyCatalogBundleIntegrity(
      catalogText,
      projectionText,
      manifestText,
      signatureData,
      catalogSigningPublicJwk,
      catalogSigningKeyId,
      crypto.subtle
    )
  }
  return verifyCatalogIntegrity(
    catalogText,
    manifestText,
    signatureData,
    catalogSigningPublicJwk,
    catalogSigningKeyId,
    crypto.subtle
  )
}
