import { describe, expect, it } from 'vitest'
import { assertGlobalEntryIdUniqueness, initializeRuntimeBundleState, loadedRuntimePairIds, registerRuntimeBundleState, runtimeBundleState, selectRuntimePair, type RuntimeBundleState } from '../../src/content/runtimeState'

function bundle(source: string, target: string, id: string, entryIds: string[] = []): RuntimeBundleState {
  return {
    catalogText: '[]', projectionText: '{}', manifestText: '{}', catalog: entryIds.map((entry_id) => ({ entry_id })),
    projection: { schema_version: '1.0', catalog_id: id, catalog_version: '1', source: { artifact: 'test' }, prompt_contexts: {}, source_aliases: {}, school_source_assignments: [], theme_path_assignments: [], source_counts: { school: {}, theme_paths: {} } },
    manifest: { catalog_id: id, catalog_version: '1', source_language: source, target_language: target, cefr_level: 'A1', entry_count: entryIds.length, license: 'test', schema_id: 'test', min_app_version: '0', catalog_sha256: 'a'.repeat(64), status: 'validated', human_review: 'PASS' }
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

  it('proves global entry ids are unique and fails closed on a cross-pair collision', () => {
    registerRuntimeBundleState('fr-es', bundle('es', 'fr', 'fr-es-ids', ['fr-es-only']))
    registerRuntimeBundleState('fr-en', bundle('en', 'fr', 'fr-en-ids', ['fr-en-only']))
    expect(() => assertGlobalEntryIdUniqueness(['fr-es', 'fr-en'])).not.toThrow()
    registerRuntimeBundleState('fr-en', bundle('en', 'fr', 'fr-en-collision', ['fr-es-only']))
    expect(() => assertGlobalEntryIdUniqueness(['fr-es', 'fr-en'])).toThrow('runtime-entry-id-collision')
  })
})
