import { initializeRuntimeBundleState, runtimeBundleState, type RuntimeCatalogManifest } from './runtimeState'
import type { CatalogProjectionDocument } from './catalogProjection'

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
    | 'payload-json-invalid'
    | 'payload-contract-invalid'
    | 'network-error'
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
  return verifyCatalogPayload(candidateCatalogText, candidateManifestText, subtle, candidateProjectionText, true)
}

function runtimeUrl(path: string, baseUrl: string): string {
  return new URL(path, baseUrl).toString()
}

export async function loadVerifiedRuntimeBundle(
  fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
  subtle: SubtleCrypto = globalThis.crypto.subtle,
  baseUrl: string = document.baseURI
): Promise<CatalogIntegrityResult> {
  let catalogText: string
  let projectionText: string
  let manifestText: string
  try {
    const [catalogResponse, projectionResponse, manifestResponse] = await Promise.all([
      fetcher(runtimeUrl('catalogs/runtime/catalog.json', baseUrl)),
      fetcher(runtimeUrl('catalogs/runtime/runtime-projection.json', baseUrl)),
      fetcher(runtimeUrl('catalogs/runtime/manifest.json', baseUrl))
    ])
    if (!catalogResponse.ok || !projectionResponse.ok || !manifestResponse.ok) return { ok: false, reason: 'network-error' }
    ;[catalogText, projectionText, manifestText] = await Promise.all([
      catalogResponse.text(), projectionResponse.text(), manifestResponse.text()
    ])
  } catch {
    return { ok: false, reason: 'network-error' }
  }

  const integrity = await verifyCatalogBundleIntegrity(catalogText, projectionText, manifestText, subtle)
  if (!integrity.ok) return integrity

  try {
    const catalog = JSON.parse(catalogText) as unknown
    const projection = JSON.parse(projectionText) as CatalogProjectionDocument
    const manifest = JSON.parse(manifestText) as RuntimeCatalogManifest
    if (!Array.isArray(catalog)) return { ok: false, reason: 'payload-contract-invalid' }
    initializeRuntimeBundleState({ catalogText, projectionText, manifestText, catalog, projection, manifest })
    return { ok: true }
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false, reason: 'payload-json-invalid' }
    return { ok: false, reason: 'payload-contract-invalid' }
  }
}

export function verifyBundledCatalogIntegrity(): Promise<CatalogIntegrityResult> {
  const bundle = runtimeBundleState()
  return verifyCatalogBundleIntegrity(bundle.catalogText, bundle.projectionText, bundle.manifestText, globalThis.crypto.subtle)
}
