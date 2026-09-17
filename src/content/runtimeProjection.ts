import canonicalEntriesJson from '../../catalogs/fr-es/a1/catalog.json'
import manifestJson from '../../catalogs/fr-es/a1/manifest.json'
import projectionJson from '../../catalogs/fr-es/a1/runtime-projection.json'
import { validateCatalogProjection, type CatalogProjectionDocument } from './catalogProjection'
import { canonicalThemeIds } from './taxonomy'

interface RuntimeManifestProjectionBinding {
  catalog_id: string
  catalog_version: string
  projection_sha256?: string
}

const manifest = manifestJson as RuntimeManifestProjectionBinding
const canonicalEntryIds = new Set((canonicalEntriesJson as Array<{ entry_id: string }>).map((entry) => entry.entry_id))
const projection = projectionJson as CatalogProjectionDocument

export function hasSignedRuntimeProjection(): boolean {
  return typeof manifest.projection_sha256 === 'string'
}

/**
 * Returns the runtime projection only when the signed manifest binds it.
 * Historical manifests without projection_sha256 remain on the frozen legacy
 * compatibility path and cannot consume the unsigned placeholder data.
 */
export function signedRuntimeProjection(): CatalogProjectionDocument | undefined {
  if (!hasSignedRuntimeProjection()) return undefined
  if (projection.catalog_id !== manifest.catalog_id) throw new Error(`projection-catalog-id:${projection.catalog_id}`)
  if (projection.catalog_version !== manifest.catalog_version) throw new Error(`projection-catalog-version:${projection.catalog_version}`)
  const validation = validateCatalogProjection(projection, canonicalEntryIds, canonicalThemeIds)
  if (!validation.valid) throw new Error(`projection-invalid:${validation.errors.join('|')}`)
  return projection
}
