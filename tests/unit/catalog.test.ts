import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import entries from '../../catalogs/fr-es/a1/catalog.json'
import manifest from '../../catalogs/fr-es/a1/manifest.json'
import { validateCatalogBundle, validateCatalogManifest } from '../../src/content/contracts'

const legacy24Hash = '89ec57723e94709904361823018c0f92de85e41fca9867049fdd0a33ca57aa78'

describe('A1 canonical catalog', () => {
  it('matches its executable schemas and cross-file invariants', () => {
    expect(validateCatalogManifest(manifest)).toEqual({ valid: true, errors: [] })
    expect(validateCatalogBundle(entries, manifest)).toEqual({ valid: true, errors: [] })
  })

  it('contains the declared number of distinct opaque identifiers', () => {
    expect(entries).toHaveLength(60)
    expect(new Set(entries.map((entry) => entry.entry_id)).size).toBe(60)
    expect(entries.every((entry) => /^[0-9a-f-]{36}$/u.test(entry.entry_id))).toBe(true)
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

  it('records the two real bilingual-review cohorts without rewriting the certified 24', () => {
    expect(manifest.catalog_version).toBe('2026.09-pack6b-r1')
    expect(manifest.entry_count).toBe(60)
    expect(manifest.license).toBe('CC BY 4.0')
    expect(manifest.status).toBe('validated')
    expect(manifest.human_review).toBe('PASS')

    const historical = entries.slice(0, 24)
    const promoted = entries.slice(24)
    expect(historical).toHaveLength(24)
    expect(promoted).toHaveLength(36)
    expect(entries.every((entry) => entry.status === 'reviewed')).toBe(true)
    expect(entries.every((entry) => entry.provenance.license === 'CC BY 4.0')).toBe(true)
    expect(historical.every((entry) => entry.version === 2)).toBe(true)
    expect(historical.every((entry) => entry.provenance.reviewed_by === 'Project owner bilingual review')).toBe(true)
    expect(historical.every((entry) => entry.provenance.reviewed_at === '2026-09-13')).toBe(true)
    expect(promoted.every((entry) => entry.version === 1)).toBe(true)
    expect(promoted.every((entry) => entry.provenance.reviewed_by === 'Project owner bilingual review')).toBe(true)
    expect(promoted.every((entry) => entry.provenance.reviewed_at === '2026-09-14')).toBe(true)
  })
})
