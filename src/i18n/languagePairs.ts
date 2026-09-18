import type { Direction, LexicalEntry } from '../domain/model'

export type LexicalSide = 'source' | 'target'

export interface DirectionConfig {
  id: Direction
  promptSide: LexicalSide
  answerSide: LexicalSide
  promptLanguage: string
  answerLanguage: string
  promptMessageId: string
  selectMessageId: string
  displayMessageId: string
}

export interface LanguagePairConfig {
  id: string
  sourceLanguage: string
  targetLanguage: string
  directions: readonly DirectionConfig[]
  voices: readonly string[]
  resources: readonly string[]
}

export const activeLanguagePair: LanguagePairConfig = {
  id: 'fr-es',
  sourceLanguage: 'es',
  targetLanguage: 'fr',
  directions: [
    {
      id: 'fr-es',
      promptSide: 'target',
      answerSide: 'source',
      promptLanguage: 'fr',
      answerLanguage: 'es',
      promptMessageId: 'translateToSpanish',
      selectMessageId: 'frEs',
      displayMessageId: 'vocabularyFrEs'
    },
    {
      id: 'es-fr',
      promptSide: 'source',
      answerSide: 'target',
      promptLanguage: 'es',
      answerLanguage: 'fr',
      promptMessageId: 'translateToFrench',
      selectMessageId: 'esFr',
      displayMessageId: 'vocabularyEsFr'
    }
  ],
  voices: [],
  resources: []
}

export function getDirectionConfig(direction: Direction, pair = activeLanguagePair): DirectionConfig {
  const config = pair.directions.find((item) => item.id === direction)
  if (!config) throw new Error(`Direction non configurée : ${direction}`)
  return config
}

export function lexicalValues(entry: LexicalEntry, side: LexicalSide): string[] {
  return side === 'source' ? [entry.source] : entry.targets
}

function normalizedCue(value: string): string {
  return value.normalize('NFC').trim().toLocaleLowerCase()
}

function answerSignature(values: string[]): string {
  return values.map(normalizedCue).sort().join('\u001f')
}

export function annotateAmbiguousPromptContexts(entries: readonly LexicalEntry[]): LexicalEntry[] {
  const sourceGroups = new Map<string, Set<string>>()
  const targetGroups = new Map<string, Set<string>>()

  for (const entry of entries) {
    const sourceKey = normalizedCue(entry.source)
    const sourceAnswers = sourceGroups.get(sourceKey) ?? new Set<string>()
    sourceAnswers.add(answerSignature(entry.targets))
    sourceGroups.set(sourceKey, sourceAnswers)

    const primaryTarget = entry.targets[0]
    if (primaryTarget) {
      const targetKey = normalizedCue(primaryTarget)
      const targetAnswers = targetGroups.get(targetKey) ?? new Set<string>()
      targetAnswers.add(answerSignature([entry.source]))
      targetGroups.set(targetKey, targetAnswers)
    }
  }

  const ambiguousSources = new Set([...sourceGroups.entries()].filter(([, answers]) => answers.size > 1).map(([key]) => key))
  const ambiguousTargets = new Set([...targetGroups.entries()].filter(([, answers]) => answers.size > 1).map(([key]) => key))

  return entries.map((entry) => ({
    ...entry,
    ...(ambiguousSources.has(normalizedCue(entry.source)) ? { sourceContext: entry.exampleSource } : {}),
    ...(entry.targets[0] && ambiguousTargets.has(normalizedCue(entry.targets[0])) ? { targetContext: entry.exampleTarget } : {})
  }))
}

export function promptContextFor(entry: LexicalEntry, direction: Direction): string | undefined {
  return getDirectionConfig(direction).promptSide === 'source' ? entry.sourceContext : entry.targetContext
}

export function promptFor(entry: LexicalEntry, direction: Direction): string {
  return lexicalValues(entry, getDirectionConfig(direction).promptSide)[0] ?? ''
}

export function expectedFor(entry: LexicalEntry, direction: Direction): string[] {
  return lexicalValues(entry, getDirectionConfig(direction).answerSide)
}

export function examplesFor(entry: LexicalEntry, direction: Direction): { prompt: string; answer: string } {
  const config = getDirectionConfig(direction)
  return config.promptSide === 'source'
    ? { prompt: entry.exampleSource, answer: entry.exampleTarget }
    : { prompt: entry.exampleTarget, answer: entry.exampleSource }
}

export function displaySourceLanguage(direction: Direction): string {
  return getDirectionConfig(direction).promptLanguage
}

export function normalizeAnswer(value: string, language: string): string {
  return value.normalize('NFC').trim().toLocaleLowerCase(language).replace(/[.!?]$/u, '')
}
