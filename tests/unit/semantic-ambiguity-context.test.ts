import { describe, expect, it } from 'vitest'
import { catalog } from '../../src/content/catalog'
import { runtimeBundleState } from '../../src/content/runtimeState'
import { promptContextFor } from '../../src/i18n/languagePairs'

function norm(value: string): string {
  return value.normalize('NFC').trim().toLocaleLowerCase()
}

describe('ADR-038 semantic ambiguity contexts', () => {
  it('explicitly controls every ambiguous displayed French prompt without leaking the Spanish answer', () => {
    const groups = new Map<string, typeof catalog>()
    for (const entry of catalog) {
      const cue = entry.targets[0]
      if (!cue) continue
      const key = norm(cue)
      groups.set(key, [...(groups.get(key) ?? []), entry])
    }

    const ambiguous = [...groups.entries()]
      .filter(([, entries]) => new Set(entries.map((entry) => norm(entry.source))).size > 1)

    const ambiguousIds = new Set(ambiguous.flatMap(([, entries]) => entries.map((entry) => entry.id)))
    const promptContexts = runtimeBundleState().projection.prompt_contexts ?? {}
    const frEsOverrideIds = new Set(Object.entries(promptContexts)
      .filter(([, directions]) => Boolean(directions?.['fr-es']))
      .map(([entryId]) => entryId))

    expect(ambiguous.length).toBeGreaterThan(0)
    expect(frEsOverrideIds).toEqual(ambiguousIds)

    for (const [cue, entries] of ambiguous) {
      const contexts = entries.map((entry) => {
        const context = promptContextFor(entry, 'fr-es')
        expect(context, `missing context for ${cue}/${entry.source}`).toBeTruthy()
        const override = promptContexts[entry.id]?.['fr-es']
        expect(context).toBe(override)
        expect(norm(context ?? '')).not.toContain(norm(entry.source))
        return norm(context ?? '')
      })
      expect(new Set(contexts).size, `contexts must differ for ${cue}`).toBe(entries.length)
    }
  })

  it('keeps source-language homographs contextualized without changing the displayed lemma', () => {
    const groups = new Map<string, typeof catalog>()
    for (const entry of catalog) {
      const key = norm(entry.source)
      groups.set(key, [...(groups.get(key) ?? []), entry])
    }
    const ambiguous = [...groups.entries()]
      .filter(([, entries]) => new Set(entries.map((entry) => JSON.stringify(entry.targets.map(norm).sort()))).size > 1)

    const ambiguousIds = new Set(ambiguous.flatMap(([, entries]) => entries.map((entry) => entry.id)))
    const promptContexts = runtimeBundleState().projection.prompt_contexts ?? {}
    const esFrOverrideIds = new Set(Object.entries(promptContexts)
      .filter(([, directions]) => Boolean(directions?.['es-fr']))
      .map(([entryId]) => entryId))

    expect(ambiguous.length).toBeGreaterThan(0)
    expect(ambiguous.some(([lemma]) => lemma === 'la salsa')).toBe(true)
    expect(esFrOverrideIds).toEqual(ambiguousIds)

    for (const [lemma, entries] of ambiguous) {
      const contexts = entries.map((entry) => {
        expect(norm(entry.source)).toBe(lemma)
        const context = promptContextFor(entry, 'es-fr')
        expect(context, `missing context for ${lemma}/${entry.targets.join(';')}`).toBeTruthy()
        const override = promptContexts[entry.id]?.['es-fr']
        expect(context).toBe(override)
        expect(entry.targets.some((answer) => norm(context ?? '').includes(norm(answer)))).toBe(false)
        return norm(context ?? '')
      })
      expect(new Set(contexts).size, `contexts must differ for ${lemma}`).toBe(entries.length)
    }
  })
})
