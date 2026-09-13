import { normalizeAnswer } from '../i18n/languagePairs'

export type AnswerDifference = 'exact' | 'accent' | 'article-or-gender' | 'spelling'

function withoutDiacritics(value: string, language: string): string {
  return normalizeAnswer(value, language).normalize('NFD').replace(/\p{M}/gu, '')
}

function withoutLeadingArticle(value: string, language: string): string {
  const normalized = normalizeAnswer(value, language)
  if (language.toLowerCase().startsWith('es')) return normalized.replace(/^(?:el|la|los|las|un|una|unos|unas)\s+/u, '')
  if (language.toLowerCase().startsWith('fr')) return normalized.replace(/^(?:le|la|les|un|une|des|l['’])\s*/u, '')
  return normalized
}

export function classifyAnswerDifference(answer: string, expected: string, language: string): AnswerDifference {
  const normalizedAnswer = normalizeAnswer(answer, language)
  const normalizedExpected = normalizeAnswer(expected, language)
  if (normalizedAnswer === normalizedExpected) return 'exact'
  if (withoutDiacritics(answer, language) === withoutDiacritics(expected, language)) return 'accent'
  if (withoutLeadingArticle(answer, language) === withoutLeadingArticle(expected, language)) return 'article-or-gender'
  return 'spelling'
}

export function bestAnswerDifference(answer: string, expected: string[], language: string): { expected: string; difference: AnswerDifference } {
  const candidates = expected.map((value) => ({ expected: value, difference: classifyAnswerDifference(answer, value, language) }))
  return candidates.find((item) => item.difference === 'exact')
    ?? candidates.find((item) => item.difference === 'accent')
    ?? candidates.find((item) => item.difference === 'article-or-gender')
    ?? candidates[0]
    ?? { expected: '', difference: 'spelling' }
}
