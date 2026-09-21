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
  promptLocale?: string
  answerLocale?: string
  promptLanguageName?: string
  answerLanguageName?: string
}

export interface LanguagePairConfig {
  id: string
  sourceLanguage: string
  targetLanguage: string
  directions: readonly DirectionConfig[]
  voices: readonly string[]
  resources: readonly string[]
}

export const frEsLanguagePair: LanguagePairConfig = {
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
      displayMessageId: 'vocabularyFrEs',
      promptLocale: 'fr-FR',
      answerLocale: 'es-ES',
      promptLanguageName: 'Français',
      answerLanguageName: 'Espagnol d’Espagne'
    },
    {
      id: 'es-fr',
      promptSide: 'source',
      answerSide: 'target',
      promptLanguage: 'es',
      answerLanguage: 'fr',
      promptMessageId: 'translateToFrench',
      selectMessageId: 'esFr',
      displayMessageId: 'vocabularyEsFr',
      promptLocale: 'es-ES',
      answerLocale: 'fr-FR',
      promptLanguageName: 'Espagnol d’Espagne',
      answerLanguageName: 'Français'
    }
  ],
  voices: [],
  resources: []
}


export const frEnLanguagePair: LanguagePairConfig = {
  id: 'fr-en',
  sourceLanguage: 'en',
  targetLanguage: 'fr',
  directions: [
    {
      id: 'fr-en',
      promptSide: 'target',
      answerSide: 'source',
      promptLanguage: 'fr',
      answerLanguage: 'en',
      promptMessageId: 'translateToEnglish',
      selectMessageId: 'frEn',
      displayMessageId: 'vocabularyFrEn',
      promptLocale: 'fr-FR',
      answerLocale: 'en-GB',
      promptLanguageName: 'Français',
      answerLanguageName: 'Anglais'
    },
    {
      id: 'en-fr',
      promptSide: 'source',
      answerSide: 'target',
      promptLanguage: 'en',
      answerLanguage: 'fr',
      promptMessageId: 'translateToFrench',
      selectMessageId: 'enFr',
      displayMessageId: 'vocabularyEnFr',
      promptLocale: 'en-GB',
      answerLocale: 'fr-FR',
      promptLanguageName: 'Anglais',
      answerLanguageName: 'Français'
    }
  ],
  voices: [],
  resources: []
}

export const languagePairRegistry = [frEsLanguagePair, frEnLanguagePair] as const satisfies readonly LanguagePairConfig[]
export const defaultLanguagePairId = frEsLanguagePair.id
export const activeLanguagePair = frEsLanguagePair

export function getLanguagePairConfig(pairId: string, registry: readonly LanguagePairConfig[] = languagePairRegistry): LanguagePairConfig {
  const pair = registry.find((item) => item.id === pairId)
  if (!pair) throw new Error(`Paire de langues non configurée : ${pairId}`)
  return pair
}

export function pairForDirection(direction: Direction, registry: readonly LanguagePairConfig[] = languagePairRegistry): LanguagePairConfig {
  const matches = registry.filter((pair) => pair.directions.some((item) => item.id === direction))
  if (matches.length !== 1) throw new Error(matches.length ? `Direction ambiguë : ${direction}` : `Direction non configurée : ${direction}`)
  return matches[0]
}

export function directionDisplayLabel(config: DirectionConfig): string {
  const prompt = config.promptLanguageName ?? config.promptLanguage
  const answer = config.answerLanguageName ?? config.answerLanguage
  const promptLocale = config.promptLocale ? ` (${config.promptLocale})` : ''
  const answerLocale = config.answerLocale ? ` (${config.answerLocale})` : ''
  return `${prompt}${promptLocale} → ${answer}${answerLocale}`
}

export function getDirectionConfig(direction: Direction, pair: LanguagePairConfig = pairForDirection(direction)): DirectionConfig {
  const config = pair.directions.find((item) => item.id === direction)
  if (!config) throw new Error(`Direction non configurée : ${direction}`)
  return config
}

export function lexicalValues(entry: LexicalEntry, side: LexicalSide): string[] {
  return side === 'source' ? [entry.source, ...(entry.sourceAliases ?? [])] : entry.targets
}

function normalizedCue(value: string): string {
  return value.normalize('NFC').trim().toLocaleLowerCase()
}

function answerSignature(values: string[]): string {
  return values.map(normalizedCue).sort().join('\u001f')
}

export type PromptContextOverrides = Record<string, Partial<Record<Direction, string>>>

export function annotateAmbiguousPromptContexts(
  entries: readonly LexicalEntry[],
  overrides: PromptContextOverrides = {}
): LexicalEntry[] {
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
      targetAnswers.add(answerSignature(lexicalValues(entry, 'source')))
      targetGroups.set(targetKey, targetAnswers)
    }
  }

  const ambiguousSources = new Set([...sourceGroups.entries()].filter(([, answers]) => answers.size > 1).map(([key]) => key))
  const ambiguousTargets = new Set([...targetGroups.entries()].filter(([, answers]) => answers.size > 1).map(([key]) => key))

  return entries.map((entry) => {
    const override = overrides[entry.id] ?? {}
    return {
      ...entry,
      ...(ambiguousSources.has(normalizedCue(entry.source))
        ? { sourceContext: override['es-fr']?.trim() || entry.exampleSource }
        : {}),
      ...(entry.targets[0] && ambiguousTargets.has(normalizedCue(entry.targets[0]))
        ? { targetContext: override['fr-es']?.trim() || entry.exampleTarget }
        : {})
    }
  })
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
