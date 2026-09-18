import { canonicalCatalogEntries, catalogManifest } from './catalog'
import { validateCatalogProjection, type CatalogProjectionDocument } from './catalogProjection'
import { runtimeBundleState } from './runtimeState'
import { canonicalThemeIds } from './taxonomy'

const projection = runtimeBundleState().projection as CatalogProjectionDocument
const canonicalEntryIds = new Set(canonicalCatalogEntries.map((entry) => entry.entry_id))

export function hasBoundRuntimeProjection(): boolean {
  return typeof catalogManifest.projection_sha256 === 'string'
}

/**
 * Returns the runtime projection only when the manifest binds its exact bytes
 * by SHA-256. Historical manifests without projection_sha256 remain on the
 * frozen legacy compatibility path and cannot consume placeholder data.
 */
export function boundRuntimeProjection(): CatalogProjectionDocument | undefined {
  if (!hasBoundRuntimeProjection()) return undefined
  if (projection.catalog_id !== catalogManifest.catalog_id) throw new Error(`projection-catalog-id:${projection.catalog_id}`)
  if (projection.catalog_version !== catalogManifest.catalog_version) throw new Error(`projection-catalog-version:${projection.catalog_version}`)
  const validation = validateCatalogProjection(projection, canonicalEntryIds, canonicalThemeIds)
  if (!validation.valid) throw new Error(`projection-invalid:${validation.errors.join('|')}`)
  return projection
}

// Compatibility aliases for code paths not yet renamed; no signature is involved.
export const hasSignedRuntimeProjection = hasBoundRuntimeProjection
export const signedRuntimeProjection = boundRuntimeProjection
