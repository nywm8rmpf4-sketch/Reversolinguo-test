import { describe, expect, it } from 'vitest'
import { initializeRuntimeBundleState, loadedRuntimePairIds, registerRuntimeBundleState, runtimeBundleState, selectRuntimePair, type RuntimeBundleState } from '../../src/content/runtimeState'

function bundle(source: string, target: string, id: string): RuntimeBundleState {
  return {
    catalogText: '[]', projectionText: '{}', manifestText: '{}', catalog: [],
    projection: { schema_version: '1.0', catalog_id: id, catalog_version: '1', source_catalog_sha256: 'a'.repeat(64), school_assignments: [], source_aliases: {}, prompt_contexts: {} },
    manifest: { catalog_id: id, catalog_version: '1', source_language: source, target_language: target, cefr_level: 'A1', entry_count: 0, license: 'test', schema_id: 'test', min_app_version: '0', catalog_sha256: 'a'.repeat(64), status: 'validated', human_review: 'PASS' }
  }
}

describe('runtime bundle registry', () => {
  it('keeps the historical single-bundle initialization compatible', () => {
    const frEs = bundle('es', 'fr', 'fr-es-test')
    initializeRuntimeBundleState(frEs)
    expect(runtimeBundleState()).toBe(frEs)
    expect(loadedRuntimePairIds()).toContain('fr-es')
  })

  it('registers and selects bundles explicitly by pair id', () => {
    const frEn = bundle('en', 'fr', 'fr-en-test')
    registerRuntimeBundleState('fr-en', frEn)
    selectRuntimePair('fr-en')
    expect(runtimeBundleState()).toBe(frEn)
    expect(runtimeBundleState('fr-en')).toBe(frEn)
  })

  it('fails closed on pair mismatch and unloaded selection', () => {
    expect(() => registerRuntimeBundleState('fr-de', bundle('en', 'fr', 'wrong'))).toThrow('runtime-pair-id-mismatch')
    expect(() => selectRuntimePair('fr-de')).toThrow('runtime-pair-not-loaded')
  })
})
