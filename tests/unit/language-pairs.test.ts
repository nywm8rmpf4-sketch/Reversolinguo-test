import { describe, expect, it } from 'vitest'
import { scheduleKey } from '../../src/domain/model'
import { activeLanguagePair, expectedFor, getDirectionConfig, normalizeAnswer, promptFor, type LanguagePairConfig } from '../../src/i18n/languagePairs'
import { catalog } from '../../src/content/catalog'

describe('language pair runtime configuration', () => {
  it('preserves the historical FR-ES direction identifiers and schedule keys', () => {
    expect(activeLanguagePair.directions.map((item) => item.id)).toEqual(['fr-es', 'es-fr'])
    expect(scheduleKey('entry', 'fr-es')).toBe('entry:fr-es')
    expect(scheduleKey('entry', 'es-fr')).toBe('entry:es-fr')
  })

  it('drives prompt and answer sides without FR/ES fields in the runtime entry', () => {
    const entry = catalog[0]
    expect(promptFor(entry, 'fr-es')).toBe(entry.targets[0])
    expect(expectedFor(entry, 'fr-es')).toEqual([entry.source])
    expect(promptFor(entry, 'es-fr')).toBe(entry.source)
    expect(expectedFor(entry, 'es-fr')).toEqual(entry.targets)
  })

  it('normalizes using the configured answer language', () => {
    expect(normalizeAnswer('  ÁRBOL. ', getDirectionConfig('fr-es').answerLanguage)).toBe('árbol')
  })

  it('can describe another pair with its own templates without changing the scheduler or existing identifiers', () => {
    const pair: LanguagePairConfig = {
      id: 'fr-de', sourceLanguage: 'de', targetLanguage: 'fr', voices: ['de-DE'], resources: [],
      directions: [{ id: 'fr-de', promptSide: 'target', answerSide: 'source', promptLanguage: 'fr', answerLanguage: 'de', promptMessageId: 'translateToGerman', selectMessageId: 'frDe', displayMessageId: 'vocabularyFrDe' }]
    }
    expect(getDirectionConfig('fr-de', pair)).toMatchObject({ answerLanguage: 'de', promptMessageId: 'translateToGerman' })
    expect(scheduleKey('entry', 'fr-de')).toBe('entry:fr-de')
  })
})
