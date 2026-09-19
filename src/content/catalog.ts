import type { CefrLevel, LexicalEntry } from '../domain/model'
import { annotateAmbiguousPromptContexts, type PromptContextOverrides } from '../i18n/languagePairs'
import { runtimeBundleState } from './runtimeState'

interface CanonicalSense {
  translations: string[]
  example_source: string
  example_target: string
}

export interface CanonicalCatalogEntry {
  entry_id: string
  language_tag: string
  lemma: string
  sense_key?: string
  article?: string
  senses: CanonicalSense[]
  cefr_level: CefrLevel
  themes: string[]
  status: 'draft' | 'reviewed' | 'validated' | 'withdrawn'
  provenance: {
    reviewed_at?: string
  }
}

const bundle = runtimeBundleState()
const sourceAliasesByEntry = bundle.projection.source_aliases ?? {}
export const catalogVersion = bundle.manifest.catalog_version
export const catalogManifest = bundle.manifest
export const canonicalCatalogEntries = bundle.catalog as CanonicalCatalogEntry[]

const runtimeEntries: LexicalEntry[] = canonicalCatalogEntries
  .filter((entry) => entry.status !== 'withdrawn')
  .map((entry) => {
    const sense = entry.senses[0]
    if (!sense) throw new Error(`Entrée sans sens exploitable : ${entry.entry_id}`)
    return {
      id: entry.entry_id,
      source: entry.lemma,
      ...(sourceAliasesByEntry[entry.entry_id]?.length ? { sourceAliases: sourceAliasesByEntry[entry.entry_id] } : {}),
      targets: sense.translations,
      sourceLanguage: entry.language_tag,
      targetLanguage: catalogManifest.target_language,
      article: entry.article,
      exampleSource: sense.example_source,
      exampleTarget: sense.example_target,
      level: entry.cefr_level,
      theme: entry.themes[0] ?? 'général'
    }
  })

const promptContextOverrides = (bundle.projection.prompt_contexts ?? {}) as PromptContextOverrides
export const catalog: LexicalEntry[] = annotateAmbiguousPromptContexts(runtimeEntries, promptContextOverrides)
