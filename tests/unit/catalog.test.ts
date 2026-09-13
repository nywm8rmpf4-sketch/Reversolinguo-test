import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import entries from '../../catalogs/fr-es/a1/catalog.json'
import manifest from '../../catalogs/fr-es/a1/manifest.json'
import { validateCatalogBundle, validateCatalogManifest } from '../../src/content/contracts'

describe('A1 canonical catalog', () => {
  it('matches its executable schemas and cross-file invariants', () => {
    expect(validateCatalogManifest(manifest)).toEqual({ valid: true, errors: [] })
    expect(validateCatalogBundle(entries, manifest)).toEqual({ valid: true, errors: [] })
  })

  it('contains the declared number of distinct opaque identifiers', () => {
    expect(entries).toHaveLength(24)
    expect(new Set(entries.map((entry) => entry.entry_id)).size).toBe(24)
    expect(entries.every((entry) => /^[0-9a-f-]{36}$/u.test(entry.entry_id))).toBe(true)
  })

  it('has the exact SHA-256 recorded in the manifest', () => {
    const raw = readFileSync(new URL('../../catalogs/fr-es/a1/catalog.json', import.meta.url))
    const hash = createHash('sha256').update(raw).digest('hex')
    expect(hash).toBe(manifest.catalog_sha256)
  })

  it('keeps human bilingual review explicitly open', () => {
    expect(manifest.human_review).toBe('NOT_EXECUTED')
    expect(entries.every((entry) => entry.status === 'draft')).toBe(true)
  })
})
