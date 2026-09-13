import catalogText from '../../catalogs/fr-es/a1/catalog.json?raw'
import manifestText from '../../catalogs/fr-es/a1/manifest.json?raw'
import signatureData from '../../catalogs/fr-es/a1/manifest.sig.json'
import { catalogSigningKeyId, catalogSigningPublicJwk } from './catalogSigningKey'

export interface CatalogSignature {
  key_id: string
  algorithm: string
  signature_base64: string
}

interface SignedManifest {
  catalog_sha256: string
}

export interface CatalogIntegrityResult {
  ok: boolean
  reason?: 'signature-metadata' | 'signature-invalid' | 'catalog-hash-mismatch' | 'invalid-manifest' | 'crypto-error'
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

export async function verifyCatalogIntegrity(
  candidateCatalogText: string,
  candidateManifestText: string,
  signature: CatalogSignature,
  publicJwk: JsonWebKey,
  expectedKeyId: string,
  subtle: SubtleCrypto
): Promise<CatalogIntegrityResult> {
  if (signature.key_id !== expectedKeyId || signature.algorithm !== 'ECDSA-P256-SHA256') {
    return { ok: false, reason: 'signature-metadata' }
  }

  let manifest: SignedManifest
  try {
    manifest = JSON.parse(candidateManifestText) as SignedManifest
    if (typeof manifest.catalog_sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(manifest.catalog_sha256)) {
      return { ok: false, reason: 'invalid-manifest' }
    }
  } catch {
    return { ok: false, reason: 'invalid-manifest' }
  }

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
    return { ok: true }
  } catch {
    return { ok: false, reason: 'crypto-error' }
  }
}

export function verifyBundledCatalogIntegrity(): Promise<CatalogIntegrityResult> {
  return verifyCatalogIntegrity(
    catalogText,
    manifestText,
    signatureData,
    catalogSigningPublicJwk,
    catalogSigningKeyId,
    crypto.subtle
  )
}
