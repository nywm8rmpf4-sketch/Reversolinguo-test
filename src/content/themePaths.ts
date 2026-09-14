import { resolveLearningPack, type LearningPack, type PackCefrTarget, type PackEntry } from './packs'
import { canonicalThemeIds, type CanonicalThemeId } from './taxonomy'

export type ThemePathLevel = Extract<PackCefrTarget, 'A1' | 'A2' | 'B1' | 'B2'>
export type ThemeSelectionScope = 'current-path' | 'theme-path'

export const voyageThemeId: CanonicalThemeId = 'voyage'
export const voyageLevels: ThemePathLevel[] = ['A1', 'A2', 'B1', 'B2']

export interface ThemeScopeSelectionInput {
  scope: ThemeSelectionScope
  themeId: CanonicalThemeId
  packs: LearningPack[]
  currentPackId?: string
  themePackId?: string
}

export function voyagePackId(level: ThemePathLevel): string {
  return `fr-es-theme-voyage-${level.toLowerCase()}`
}

function buildVoyagePack(level: ThemePathLevel, previous?: ThemePathLevel): LearningPack {
  return {
    pack_id: voyagePackId(level),
    pack_version: '2026.09-pack5-r1',
    audience: 'theme',
    language_pair: 'fr-es',
    framework: 'Reversolinguo-Theme',
    framework_version: 'R5-2026-09',
    cefr_target: level,
    inherits_from: previous ? [voyagePackId(previous)] : [],
    themes: [voyageThemeId],
    entries: [],
    sources: ['documentation/specifications/PRODUCT_SPECIFICATION_AMENDMENT_R5_PACKS_PATHS.md'],
    status: 'draft',
    human_review: 'NOT_EXECUTED'
  }
}

/**
 * Structural manifests only. PACK-6 owns lexical acquisition and assignment.
 */
export const voyageThemePacks: LearningPack[] = voyageLevels.map((level, index) =>
  buildVoyagePack(level, voyageLevels[index - 1])
)

export function voyagePackForLevel(
  level: ThemePathLevel,
  packs: readonly LearningPack[] = voyageThemePacks
): LearningPack | undefined {
  return packs.find((pack) => pack.pack_id === voyagePackId(level) && pack.audience === 'theme')
}

function filterByTheme(entries: PackEntry[], themeId: CanonicalThemeId): PackEntry[] {
  return entries.filter((entry) => entry.theme === themeId)
}

/**
 * `current-path` is a thematic view over the active school/adult pack.
 * `theme-path` resolves an autonomous thematic pack. Both reuse canonical UUIDs.
 */
export function resolveThemeScopeEntries(input: ThemeScopeSelectionInput): PackEntry[] {
  if (!canonicalThemeIds.has(input.themeId)) throw new Error(`Unknown canonical theme: ${input.themeId}`)

  if (input.scope === 'current-path') {
    if (!input.currentPackId) throw new Error('current-path requires currentPackId')
    return filterByTheme(resolveLearningPack(input.currentPackId, input.packs), input.themeId)
  }

  if (!input.themePackId) throw new Error('theme-path requires themePackId')
  const themePack = input.packs.find((pack) => pack.pack_id === input.themePackId)
  if (!themePack) throw new Error(`Unknown theme pack: ${input.themePackId}`)
  if (themePack.audience !== 'theme') throw new Error(`theme-path requires audience=theme: ${input.themePackId}`)
  if (!themePack.themes.includes(input.themeId)) throw new Error(`Theme pack does not declare ${input.themeId}: ${input.themePackId}`)
  return filterByTheme(resolveLearningPack(input.themePackId, input.packs), input.themeId)
}

export interface ThemePathValidationResult {
  valid: boolean
  errors: string[]
}

export function validateVoyageThemePath(packs: readonly LearningPack[] = voyageThemePacks): ThemePathValidationResult {
  const errors: string[] = []
  const byId = new Map(packs.map((pack) => [pack.pack_id, pack]))

  for (const level of voyageLevels) {
    const pack = byId.get(voyagePackId(level))
    if (!pack) {
      errors.push(`missing-voyage-level:${level}`)
      continue
    }
    if (pack.audience !== 'theme') errors.push(`wrong-audience:${pack.pack_id}`)
    if (pack.themes.length !== 1 || pack.themes[0] !== voyageThemeId) errors.push(`wrong-theme:${pack.pack_id}`)
    if (pack.entries.length !== 0) errors.push(`premature-lexical-content:${pack.pack_id}`)
  }

  if (packs.length !== voyageLevels.length) errors.push(`unexpected-voyage-pack-count:${packs.length}`)
  return { valid: errors.length === 0, errors: [...new Set(errors)] }
}
