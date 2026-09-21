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

const runtimeBundles = new Map<string, RuntimeBundleState>()
let activeRuntimePairId: string | undefined

function primaryLanguage(tag: string): string {
  return tag.toLowerCase().split('-')[0]
}

function pairIdForBundle(bundle: RuntimeBundleState): string {
  return `${primaryLanguage(bundle.manifest.target_language)}-${primaryLanguage(bundle.manifest.source_language)}`
}

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
  const pairId = pairIdForBundle(bundle)
  runtimeBundles.set(pairId, bundle)
  activeRuntimePairId ??= pairId
}

export function registerRuntimeBundleState(pairId: string, bundle: RuntimeBundleState): void {
  const inferred = pairIdForBundle(bundle)
  if (pairId !== inferred) throw new Error(`runtime-pair-id-mismatch:${pairId}/${inferred}`)
  initializeRuntimeBundleState(bundle)
}

export function selectRuntimePair(pairId: string): void {
  if (!runtimeBundles.has(pairId)) throw new Error(`runtime-pair-not-loaded:${pairId}`)
  activeRuntimePairId = pairId
}

export function runtimeBundleState(pairId: string | undefined = activeRuntimePairId): RuntimeBundleState {
  if (!pairId) throw new Error('runtime-bundle-not-initialized')
  const bundle = runtimeBundles.get(pairId)
  if (!bundle) throw new Error(`runtime-pair-not-loaded:${pairId}`)
  return bundle
}

export function loadedRuntimePairIds(): string[] {
  return [...runtimeBundles.keys()]
}

export function assertGlobalEntryIdUniqueness(pairIds: readonly string[] = loadedRuntimePairIds()): void {
  const owners = new Map<string, string>()
  for (const pairId of pairIds) {
    const bundle = runtimeBundleState(pairId)
    for (const candidate of bundle.catalog) {
      if (!candidate || typeof candidate !== 'object' || typeof (candidate as { entry_id?: unknown }).entry_id !== 'string') {
        throw new Error(`runtime-entry-id-invalid:${pairId}`)
      }
      const entryId = (candidate as { entry_id: string }).entry_id
      const previous = owners.get(entryId)
      if (previous) throw new Error(`runtime-entry-id-collision:${entryId}:${previous}:${pairId}`)
      owners.set(entryId, pairId)
    }
  }
}
