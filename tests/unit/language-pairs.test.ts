import { describe, expect, it } from 'vitest'
import { scheduleKey } from '../../src/domain/model'
import { activeLanguagePair, annotateAmbiguousPromptContexts, expectedFor, getDirectionConfig, normalizeAnswer, promptContextFor, promptFor, type LanguagePairConfig } from '../../src/i18n/languagePairs'
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

  it('adds context only when an identical source prompt can require different answers', () => {
    const [sauce, dance] = annotateAmbiguousPromptContexts([
      {
        id: 'sauce', source: 'la salsa', targets: ['la sauce'], sourceLanguage: 'es', targetLanguage: 'fr',
        exampleSource: 'La salsa está demasiado caliente.', exampleTarget: 'La sauce est trop chaude.', level: 'A2', theme: 'alimentation'
      },
      {
        id: 'dance', source: 'la salsa', targets: ['la salsa (danse / musique)'], sourceLanguage: 'es', targetLanguage: 'fr',
        exampleSource: 'Bailamos salsa en la fiesta.', exampleTarget: 'Nous dansons la salsa à la fête.', level: 'A2', theme: 'culture-fetes'
      }
    ])

    expect(promptContextFor(sauce, 'es-fr')).toBe('La salsa está demasiado caliente.')
    expect(promptContextFor(dance, 'es-fr')).toBe('Bailamos salsa en la fiesta.')
    expect(promptContextFor(sauce, 'fr-es')).toBeUndefined()
    expect(promptContextFor(dance, 'fr-es')).toBeUndefined()
  })

  it('disambiguates identical displayed target prompts in the reverse direction', () => {
    const [first, second] = annotateAmbiguousPromptContexts([
      {
        id: 'one', source: 'el banco', targets: ['le banc'], sourceLanguage: 'es', targetLanguage: 'fr',
        exampleSource: 'Me siento en el banco.', exampleTarget: 'Je m’assois sur le banc.', level: 'A2', theme: 'ville-services'
      },
      {
        id: 'two', source: 'la banqueta', targets: ['le banc'], sourceLanguage: 'es', targetLanguage: 'fr',
        exampleSource: 'La banqueta está junto a la puerta.', exampleTarget: 'Le banc est près de la porte.', level: 'A2', theme: 'maison'
      }
    ])

    expect(promptContextFor(first, 'fr-es')).toBe('Je m’assois sur le banc.')
    expect(promptContextFor(second, 'fr-es')).toBe('Le banc est près de la porte.')
    expect(promptContextFor(first, 'es-fr')).toBeUndefined()
  })

  it('does not add context for an ambiguous secondary translation that is never displayed as the prompt', () => {
    const [first, second] = annotateAmbiguousPromptContexts([
      {
        id: 'one', source: 'el asiento', targets: ['le siège', 'le banc'], sourceLanguage: 'es', targetLanguage: 'fr',
        exampleSource: 'Ocupo el asiento.', exampleTarget: 'J’occupe le siège.', level: 'A2', theme: 'ville-services'
      },
      {
        id: 'two', source: 'la banqueta', targets: ['le banc'], sourceLanguage: 'es', targetLanguage: 'fr',
        exampleSource: 'La banqueta está junto a la puerta.', exampleTarget: 'Le banc est près de la porte.', level: 'A2', theme: 'maison'
      }
    ])

    expect(promptFor(first, 'fr-es')).toBe('le siège')
    expect(promptContextFor(first, 'fr-es')).toBeUndefined()
    expect(promptContextFor(second, 'fr-es')).toBeUndefined()
  })

  it('uses an explicit override only for an actually ambiguous displayed prompt', () => {
    const [first, second, unique] = annotateAmbiguousPromptContexts([
      {
        id: 'one', source: 'grande', targets: ['grand'], sourceLanguage: 'es', targetLanguage: 'fr',
        exampleSource: 'La casa es grande.', exampleTarget: 'La maison est grande.', level: 'A1', theme: 'description'
      },
      {
        id: 'two', source: 'alto, alta', targets: ['grand'], sourceLanguage: 'es', targetLanguage: 'fr',
        exampleSource: 'Mi hermano es alto.', exampleTarget: 'Mon frère est grand.', level: 'A1', theme: 'description'
      },
      {
        id: 'unique', source: 'pequeño, pequeña', targets: ['petit'], sourceLanguage: 'es', targetLanguage: 'fr',
        exampleSource: 'La casa es pequeña.', exampleTarget: 'La maison est petite.', level: 'A1', theme: 'description'
      }
    ], {
      one: { 'fr-es': 'Dimensions générales d’une chose ou d’un lieu.' },
      two: { 'fr-es': 'Hauteur d’une personne ou d’un objet vertical.' },
      unique: { 'fr-es': 'Cet override doit être ignoré.' }
    })

    expect(promptContextFor(first, 'fr-es')).toBe('Dimensions générales d’une chose ou d’un lieu.')
    expect(promptContextFor(second, 'fr-es')).toBe('Hauteur d’une personne ou d’un objet vertical.')
    expect(promptContextFor(unique, 'fr-es')).toBeUndefined()
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
