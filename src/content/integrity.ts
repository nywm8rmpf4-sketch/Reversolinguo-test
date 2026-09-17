import catalogText from '../../catalogs/fr-es/a1/catalog.json?raw'
import manifestText from '../../catalogs/fr-es/a1/manifest.json?raw'
import projectionText from '../../catalogs/fr-es/a1/runtime-projection.json?raw'

interface CatalogManifestIntegrity {
  catalog_sha256: string
  projection_sha256?: string
}

export interface CatalogIntegrityResult {
  ok: boolean
  reason?:
    | 'catalog-hash-mismatch'
    | 'projection-hash-missing'
    | 'projection-required'
    | 'projection-hash-mismatch'
    | 'invalid-manifest'
    | 'crypto-error'
}

const encoder = new TextEncoder()

async function sha256Hex(value: string, subtle: SubtleCrypto): Promise<string> {
  const digest = await subtle.digest('SHA-256', encoder.encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function parseIntegrityManifest(candidateManifestText: string): CatalogManifestIntegrity | undefined {
  try {
    const manifest = JSON.parse(candidateManifestText) as CatalogManifestIntegrity
    if (typeof manifest.catalog_sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(manifest.catalog_sha256)) return undefined
    if (manifest.projection_sha256 !== undefined && !/^[0-9a-f]{64}$/u.test(manifest.projection_sha256)) return undefined
    return manifest
  } catch {
    return undefined
  }
}

async function verifyCatalogPayload(
  candidateCatalogText: string,
  candidateManifestText: string,
  subtle: SubtleCrypto,
  candidateProjectionText?: string,
  projectionRequired = false
): Promise<CatalogIntegrityResult> {
  const manifest = parseIntegrityManifest(candidateManifestText)
  if (!manifest) return { ok: false, reason: 'invalid-manifest' }
  if (projectionRequired && manifest.projection_sha256 === undefined) return { ok: false, reason: 'projection-hash-missing' }
  if (manifest.projection_sha256 !== undefined && candidateProjectionText === undefined) return { ok: false, reason: 'projection-required' }

  try {
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
  subtle: SubtleCrypto
): Promise<CatalogIntegrityResult> {
  return verifyCatalogPayload(candidateCatalogText, candidateManifestText, subtle)
}

export function verifyCatalogBundleIntegrity(
  candidateCatalogText: string,
  candidateProjectionText: string,
  candidateManifestText: string,
  subtle: SubtleCrypto
): Promise<CatalogIntegrityResult> {
  return verifyCatalogPayload(
    candidateCatalogText,
    candidateManifestText,
    subtle,
    candidateProjectionText,
    true
  )
}

export function verifyBundledCatalogIntegrity(): Promise<CatalogIntegrityResult> {
  const manifest = parseIntegrityManifest(manifestText)
  if (!manifest) return Promise.resolve({ ok: false, reason: 'invalid-manifest' })
  if (manifest.projection_sha256 !== undefined) {
    return verifyCatalogBundleIntegrity(catalogText, projectionText, manifestText, crypto.subtle)
  }
  return verifyCatalogIntegrity(catalogText, manifestText, crypto.subtle)
}
