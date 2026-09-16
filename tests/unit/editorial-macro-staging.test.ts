import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface MicroTranche {
  tranche_id: string
  cefr_level: string
  source_range: [string, string]
  source_map: string
  entry_files: string[]
  expected_included: number
  expected_excluded: number
  materializer_batch_id: string
}

interface MicroManifest {
  validation_profile: string
  tranches: MicroTranche[]
}

interface SourceMap {
  tranche_id: string
  source_range: [string, string]
  included: Array<{ review_id: string; entry_id?: string; lemma: string }>
  excluded: Array<{ review_id: string; lemma: string; reason?: string }>
}

interface MacroBatch {
  macro_batch_id: string
  cefr_level: string
  micro_tranche_ids: string[]
  source_range: [string, string]
  expected_source_units: number
  expected_drafts: number
  expected_excluded_or_reconciled: number
  reuse_mode: string
  qualification_mode: string
  semantic_review_mode: string
}

interface MacroManifest {
  schema_version: string
  validation_profile: string
  micro_manifest: string
  policy: {
    micro_tranches_remain_atomic: boolean
    exact_source_coverage: boolean
    cross_micro_collision_guard: boolean
    single_public_materialization: boolean
    aggregate_semantic_review_complete: boolean
    fail_closed: boolean
  }
  adaptive_sizing: {
    pilot_micro_tranches: number
    next_trial_micro_tranches: number
    increase_requires: string[]
    reduce_if: string[]
  }
  macro_batches: MacroBatch[]
}

const root = process.cwd()

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8')) as T
}

function reviewNumber(id: string): number {
  const match = /^(?:REV-[A-Z0-9]+-)(\d+)$/u.exec(id)
  if (!match) throw new Error(`invalid-review-id:${id}`)
  return Number(match[1])
}

function rangeSize([start, end]: [string, string]): number {
  const first = reviewNumber(start)
  const last = reviewNumber(end)
  if (last < first) throw new Error(`invalid-range:${start}..${end}`)
  return last - first + 1
}

const macroManifest = readJson<MacroManifest>('catalogs/fr-es/a1/drafts/macro-batches.manifest.json')
const microManifest = readJson<MicroManifest>(macroManifest.micro_manifest)
const microById = new Map(microManifest.tranches.map((tranche) => [tranche.tranche_id, tranche]))

describe('lexical macro-batch editorial staging', () => {
  it('declares a fail-closed two-level editorial contract', () => {
    expect(macroManifest.schema_version).toBe('1.0')
    expect(macroManifest.validation_profile).toBe('EDITORIAL_STAGING')
    expect(microManifest.validation_profile).toBe('EDITORIAL_STAGING')
    expect(macroManifest.policy).toEqual({
      micro_tranches_remain_atomic: true,
      exact_source_coverage: true,
      cross_micro_collision_guard: true,
      single_public_materialization: true,
      aggregate_semantic_review_complete: true,
      fail_closed: true
    })
  })

  it('composes only consecutive micro-tranches and accounts for the exact source range', () => {
    for (const macro of macroManifest.macro_batches) {
      expect(macro.micro_tranche_ids.length).toBeGreaterThan(0)
      const micros = macro.micro_tranche_ids.map((id) => {
        const tranche = microById.get(id)
        expect(tranche, `${macro.macro_batch_id}: unknown micro-tranche ${id}`).toBeDefined()
        return tranche as MicroTranche
      })

      const manifestIndexes = micros.map((micro) => microManifest.tranches.findIndex((item) => item.tranche_id === micro.tranche_id))
      for (let index = 1; index < manifestIndexes.length; index += 1) {
        expect(manifestIndexes[index], `${macro.macro_batch_id}: non-consecutive micro-tranche order`).toBe(manifestIndexes[index - 1] + 1)
        expect(
          reviewNumber(micros[index].source_range[0]),
          `${macro.macro_batch_id}: gap/overlap before ${micros[index].tranche_id}`
        ).toBe(reviewNumber(micros[index - 1].source_range[1]) + 1)
      }

      expect(macro.source_range).toEqual([micros[0].source_range[0], micros.at(-1)?.source_range[1]])
      expect(macro.expected_source_units).toBe(rangeSize(macro.source_range))
      expect(micros.reduce((sum, micro) => sum + rangeSize(micro.source_range), 0)).toBe(macro.expected_source_units)
    }
  })

  it('preserves micro-tranche accounting and diagnostic locality without implicit merging', () => {
    for (const macro of macroManifest.macro_batches) {
      let drafts = 0
      let excluded = 0
      const diagnosticKeys = new Set<string>()
      const physicalFiles = new Set<string>()

      for (const trancheId of macro.micro_tranche_ids) {
        const micro = microById.get(trancheId) as MicroTranche
        const sourceMap = readJson<SourceMap>(micro.source_map)
        expect(sourceMap.tranche_id).toBe(micro.tranche_id)
        expect(sourceMap.source_range).toEqual(micro.source_range)
        expect(sourceMap.included).toHaveLength(micro.expected_included)
        expect(sourceMap.excluded).toHaveLength(micro.expected_excluded)

        drafts += sourceMap.included.length
        excluded += sourceMap.excluded.length

        for (const row of [...sourceMap.included, ...sourceMap.excluded]) {
          const key = `${macro.macro_batch_id}/${micro.tranche_id}/${row.review_id}`
          expect(diagnosticKeys.has(key), `duplicate diagnostic key ${key}`).toBe(false)
          diagnosticKeys.add(key)
        }

        for (const path of [micro.source_map, ...micro.entry_files]) {
          expect(physicalFiles.has(path), `${macro.macro_batch_id}: physical micro file reused implicitly: ${path}`).toBe(false)
          physicalFiles.add(path)
        }
      }

      expect(drafts).toBe(macro.expected_drafts)
      expect(excluded).toBe(macro.expected_excluded_or_reconciled)
      expect(drafts + excluded).toBe(macro.expected_source_units)
    }
  })

  it('requires a single public qualification and a complete aggregate semantic review', () => {
    for (const macro of macroManifest.macro_batches) {
      expect(macro.reuse_mode).toBe('data_identity_only_no_verdict_reuse')
      expect(macro.qualification_mode).toBe('single_public_editorial_staging')
      expect(macro.semantic_review_mode).toBe('complete_aggregate')
    }
  })

  it('keeps macro sizing adaptive instead of promoting 8 micro-tranches to an unconditional default', () => {
    expect(macroManifest.adaptive_sizing.pilot_micro_tranches).toBe(4)
    expect(macroManifest.adaptive_sizing.next_trial_micro_tranches).toBe(8)
    expect(macroManifest.adaptive_sizing.increase_requires).toEqual(expect.arrayContaining([
      'machine_pass',
      'semantic_pass',
      'diagnostic_locality_preserved',
      'metrics_complete'
    ]))
    expect(macroManifest.adaptive_sizing.reduce_if).toEqual(expect.arrayContaining([
      'cross_micro_errors_multiple',
      'diagnostic_locality_degraded',
      'more_than_one_substantial_restart'
    ]))
  })
})
