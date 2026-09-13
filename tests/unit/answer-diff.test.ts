import { describe, expect, it } from 'vitest'
import { bestAnswerDifference, classifyAnswerDifference } from '../../src/domain/answerDiff'

describe('answer difference classification', () => {
  it('distinguishes accents without accepting the spelling as exact', () => {
    expect(classifyAnswerDifference('como', 'cómo', 'es')).toBe('accent')
  })

  it('distinguishes a missing or incorrect Spanish article or gender marker', () => {
    expect(classifyAnswerDifference('mano', 'la mano', 'es')).toBe('article-or-gender')
    expect(classifyAnswerDifference('el mano', 'la mano', 'es')).toBe('article-or-gender')
  })

  it('classifies other deviations as spelling or formulation', () => {
    expect(classifyAnswerDifference('libra', 'libro', 'es')).toBe('spelling')
  })

  it('selects the most informative accepted answer variant', () => {
    expect(bestAnswerDifference("l'ecole", ['l’école', "l'ecole"], 'fr')).toEqual({ expected: "l'ecole", difference: 'exact' })
  })
})
