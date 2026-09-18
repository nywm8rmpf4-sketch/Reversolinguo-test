import { describe, expect, it } from 'vitest'
import promptContextOverridesJson from '../../catalogs/fr-es/a2/prompt-context-overrides.json'
import { catalog } from '../../src/content/catalog'
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
    const overrideIds = new Set(Object.keys(promptContextOverridesJson.contexts))

    expect(ambiguous).toHaveLength(11)
    expect(overrideIds).toEqual(ambiguousIds)

    for (const [cue, entries] of ambiguous) {
      const contexts = entries.map((entry) => {
        const context = promptContextFor(entry, 'fr-es')
        expect(context, `missing context for ${cue}/${entry.source}`).toBeTruthy()
        const override = promptContextOverridesJson.contexts[entry.id as keyof typeof promptContextOverridesJson.contexts]?.['fr-es']
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

    expect(ambiguous).toHaveLength(1)
    expect(ambiguous[0]?.[0]).toBe('la salsa')
    const entries = ambiguous[0]?.[1] ?? []
    expect(entries).toHaveLength(2)
    for (const entry of entries) {
      expect(entry.source).toBe('la salsa')
      const context = promptContextFor(entry, 'es-fr')
      expect(context).toBeTruthy()
      expect(entry.targets.some((answer) => norm(context ?? '').includes(norm(answer)))).toBe(false)
    }
  })
})
