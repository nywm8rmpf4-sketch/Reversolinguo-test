import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import entries from '../../catalogs/fr-es/a1/catalog.json'
import manifest from '../../catalogs/fr-es/a1/manifest.json'
import projection from '../../catalogs/fr-es/a1/runtime-projection.json'
import { validateCatalogBundle, validateCatalogManifest } from '../../src/content/contracts'

const legacy24Hash = '89ec57723e94709904361823018c0f92de85e41fca9867049fdd0a33ca57aa78'

describe('A1 canonical catalog', () => {
  it('matches its executable schemas and cross-file invariants', () => {
    expect(validateCatalogManifest(manifest)).toEqual({ valid: true, errors: [] })
    expect(validateCatalogBundle(entries, manifest)).toEqual({ valid: true, errors: [] })
    expect(projection.catalog_id).toBe(manifest.catalog_id)
    expect(projection.catalog_version).toBe(manifest.catalog_version)
  })

  it('contains the declared number of distinct opaque identifiers', () => {
    expect(entries).toHaveLength(475)
    expect(new Set(entries.map((entry) => entry.entry_id)).size).toBe(475)
  })

  it('preserves the first 24 certified lexical objects byte-semantically', () => {
    const hash = createHash('sha256').update(JSON.stringify(entries.slice(0, 24))).digest('hex')
    expect(hash).toBe(legacy24Hash)
  })

  it('has the exact SHA-256 recorded in the manifest', () => {
    const raw = readFileSync(resolve(process.cwd(), 'catalogs/fr-es/a1/catalog.json'))
    const hash = createHash('sha256').update(raw).digest('hex')
    expect(hash).toBe(manifest.catalog_sha256)
  })

  it('records all three real bilingual-review cohorts without rewriting earlier cohorts', () => {
    expect(manifest.catalog_version).toBe(projection.catalog_version)
    expect(manifest.entry_count).toBe(475)
    expect(manifest.license).toBe('CC BY 4.0')
    expect(manifest.status).toBe('validated')
    expect(manifest.human_review).toBe('PASS')

    const historical = entries.slice(0, 24)
    const pack6B = entries.slice(24, 60)
    const macroA1 = entries.slice(60)
    expect(historical).toHaveLength(24)
    expect(pack6B).toHaveLength(36)
    expect(macroA1).toHaveLength(415)
    expect(entries.every((entry) => entry.status === 'reviewed')).toBe(true)
    expect(entries.every((entry) => entry.provenance.license === 'CC BY 4.0')).toBe(true)
    expect(historical.every((entry) => entry.version === 2)).toBe(true)
    expect(historical.every((entry) => entry.provenance.reviewed_by === 'Project owner bilingual review')).toBe(true)
    expect(historical.every((entry) => entry.provenance.reviewed_at === '2026-09-13')).toBe(true)
    expect(pack6B.every((entry) => entry.version === 1)).toBe(true)
    expect(pack6B.every((entry) => entry.provenance.reviewed_by === 'Project owner bilingual review')).toBe(true)
    expect(pack6B.every((entry) => entry.provenance.reviewed_at === '2026-09-14')).toBe(true)
    expect(macroA1.every((entry) => entry.version === 1)).toBe(true)
    expect(macroA1.every((entry) => entry.provenance.reviewed_by === 'Project owner bilingual review')).toBe(true)
    expect(macroA1.every((entry) => entry.provenance.reviewed_at === '2026-09-16')).toBe(true)
  })
})
