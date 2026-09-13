import canonicalEntries from '../../catalogs/fr-es/a1/catalog.json'
import manifest from '../../catalogs/fr-es/a1/manifest.json'
import type { CefrLevel, LexicalEntry } from '../domain/model'

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
export const catalog: LexicalEntry[] = (canonicalEntries as CanonicalEntry[])
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
