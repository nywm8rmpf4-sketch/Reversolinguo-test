import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { initializeRuntimeBundleState, type RuntimeCatalogManifest } from '../src/content/runtimeState'
import type { CatalogProjectionDocument } from '../src/content/catalogProjection'

function runtimeText(name: string): string {
  return readFileSync(resolve(process.cwd(), 'public/catalogs/runtime', name), 'utf8')
}

const catalogText = runtimeText('catalog.json')
const projectionText = runtimeText('runtime-projection.json')
const manifestText = runtimeText('manifest.json')

initializeRuntimeBundleState({
  catalogText,
  projectionText,
  manifestText,
  catalog: JSON.parse(catalogText) as unknown[],
  projection: JSON.parse(projectionText) as CatalogProjectionDocument,
  manifest: JSON.parse(manifestText) as RuntimeCatalogManifest
})
