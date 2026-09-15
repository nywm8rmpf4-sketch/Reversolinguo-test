import { webcrypto } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import canonicalEntries from '../../catalogs/fr-es/a1/catalog.json'
import { prepareLexicalBatch, type LexicalBatchInput } from '../../src/content/lexicalBatch'

const subtle = webcrypto.subtle as unknown as SubtleCrypto
const existingEntries = canonicalEntries.map((entry) => ({
  entry_id: entry.entry_id,
  language_tag: entry.language_tag,
  lemma: entry.lemma
}))

function syntheticBatch(count: number): LexicalBatchInput {
  return {
    batch_id: `benchmark-pack6c-${count}`,
    source_language: 'es',
    target_language: 'fr',
    cefr_level: 'A1',
    provenance: {
      source: 'PACK-6C synthetic benchmark — NOT PUBLISHABLE',
      license: 'CC BY 4.0',
      authored_by: 'Reversolinguo synthetic benchmark'
    },
    entries: Array.from({ length: count }, (_, index) => {
      const label = String(index).padStart(5, '0')
      return {
        lemma: `benchmark-${label}`,
        part_of_speech: 'other' as const,
        senses: [{
          sense_id: 's1',
          translations: [`benchmark-fr-${label}`],
          example_source: `Ejemplo sintético ${label}.`,
          example_target: `Exemple synthétique ${label}.`
        }],
        cefr_rationale: 'Fixture de performance synthétique non publiable.',
        themes: ['description'],
        variety: 'synthetic-benchmark'
      }
    })
  }
}

async function runBenchmark(count: number) {
  const input = syntheticBatch(count)
  const sourceBytes = Buffer.byteLength(JSON.stringify(input), 'utf8')
  const heapBefore = process.memoryUsage().heapUsed
  const started = performance.now()
  const result = await prepareLexicalBatch(input, {
    subtle,
    existingEntries,
    expectedLicense: 'CC BY 4.0'
  })
  const elapsedMs = performance.now() - started
  const heapAfter = process.memoryUsage().heapUsed
  const outputBytes = Buffer.byteLength(JSON.stringify(result.entries), 'utf8')

  const metrics = {
    count,
    source_bytes: sourceBytes,
    output_bytes: outputBytes,
    elapsed_ms: Math.round(elapsedMs * 100) / 100,
    heap_delta_bytes: heapAfter - heapBefore,
    errors: result.errors.length
  }
  console.info(`[PACK6C_BENCHMARK] ${JSON.stringify(metrics)}`)
  return { result, metrics }
}

describe('PACK-6C scalable lexical batch benchmark', () => {
  it('prepares and validates synthetic 1,000 and 5,000 entry batches without publishing them', async () => {
    for (const count of [1_000, 5_000]) {
      const { result, metrics } = await runBenchmark(count)
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
      expect(result.entries).toHaveLength(count)
      expect(new Set(result.entries.map((entry) => entry.entry_id)).size).toBe(count)
      expect(metrics.source_bytes).toBeGreaterThan(0)
      expect(metrics.output_bytes).toBeGreaterThan(metrics.source_bytes)
    }
  }, 60_000)
})
