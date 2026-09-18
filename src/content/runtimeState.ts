import type { CatalogProjectionDocument } from './catalogProjection'

export interface RuntimeCatalogManifest {
  catalog_id: string
  catalog_version: string
  source_language: string
  target_language: string
  cefr_level: 'PRE-A1' | 'A1' | 'A2' | 'B1' | 'B2'
  entry_count: number
  license: string
  schema_id: string
  min_app_version: string
  catalog_sha256: string
  projection_sha256?: string
  status: 'draft-human-review' | 'validated' | 'withdrawn'
  human_review: 'NOT_EXECUTED' | 'PASS' | 'FAIL' | 'TIMEOUT'
}

export interface RuntimeBundleState {
  catalogText: string
  projectionText: string
  manifestText: string
  catalog: unknown[]
  projection: CatalogProjectionDocument
  manifest: RuntimeCatalogManifest
}

let activeRuntimeBundle: RuntimeBundleState | undefined

export function initializeRuntimeBundleState(bundle: RuntimeBundleState): void {
  if (!Array.isArray(bundle.catalog)) throw new Error('runtime-catalog-not-array')
  if (!bundle.manifest || typeof bundle.manifest !== 'object') throw new Error('runtime-manifest-invalid')
  if (!bundle.projection || typeof bundle.projection !== 'object') throw new Error('runtime-projection-invalid')
  if (bundle.manifest.entry_count !== bundle.catalog.length) {
    throw new Error(`runtime-entry-count-mismatch:${bundle.catalog.length}/${bundle.manifest.entry_count}`)
  }
  if (bundle.projection.catalog_id !== bundle.manifest.catalog_id) {
    throw new Error(`runtime-projection-catalog-id:${bundle.projection.catalog_id}/${bundle.manifest.catalog_id}`)
  }
  if (bundle.projection.catalog_version !== bundle.manifest.catalog_version) {
    throw new Error(`runtime-projection-version:${bundle.projection.catalog_version}/${bundle.manifest.catalog_version}`)
  }
  activeRuntimeBundle = bundle
}

export function runtimeBundleState(): RuntimeBundleState {
  if (!activeRuntimeBundle) throw new Error('runtime-bundle-not-initialized')
  return activeRuntimeBundle
}
