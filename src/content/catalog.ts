import canonicalEntries from '../../catalogs/fr-es/a2/catalog.json'
import manifest from '../../catalogs/fr-es/a2/manifest.json'
import promptContextOverridesJson from '../../catalogs/fr-es/a2/prompt-context-overrides.json'
import type { CefrLevel, LexicalEntry } from '../domain/model'
import { annotateAmbiguousPromptContexts, type PromptContextOverrides } from '../i18n/languagePairs'

interface CanonicalSense {
  translations: string[]
  example_source: string
  example_target: string
}

interface CanonicalEntry {
  entry_id: string
  language_tag: string
  lemma: string
  article?: string
  senses: CanonicalSense[]
  cefr_level: CefrLevel
  themes: string[]
  status: 'draft' | 'reviewed' | 'validated' | 'withdrawn'
}

export const catalogVersion = manifest.catalog_version
export const catalogManifest = manifest
const runtimeEntries: LexicalEntry[] = (canonicalEntries as CanonicalEntry[])
  .filter((entry) => entry.status !== 'withdrawn')
  .map((entry) => {
    const sense = entry.senses[0]
    if (!sense) throw new Error(`Entrée sans sens exploitable : ${entry.entry_id}`)
    return {
      id: entry.entry_id,
      source: entry.lemma,
      targets: sense.translations,
      sourceLanguage: entry.language_tag,
      targetLanguage: manifest.target_language,
      article: entry.article,
      exampleSource: sense.example_source,
      exampleTarget: sense.example_target,
      level: entry.cefr_level,
      theme: entry.themes[0] ?? 'général'
    }
  })

interface PromptContextOverrideFile {
  schema_version: string
  catalog_id: string
  contexts: PromptContextOverrides
}

const promptContextOverrides = promptContextOverridesJson as PromptContextOverrideFile
if (promptContextOverrides.catalog_id !== manifest.catalog_id) {
  throw new Error(`Prompt context catalog mismatch: ${promptContextOverrides.catalog_id} != ${manifest.catalog_id}`)
}

export const catalog: LexicalEntry[] = annotateAmbiguousPromptContexts(runtimeEntries, promptContextOverrides.contexts)
