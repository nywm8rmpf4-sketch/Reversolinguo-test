import { validateLearningPack } from './contracts'

export type PackAudience = 'school' | 'adult' | 'theme'
export type PackTrack = 'LVA' | 'LVB' | 'LVC'
export type PackRole = 'core' | 'reinforcement' | 'extension' | 'optional'
export type PackStatus = 'draft' | 'reviewed' | 'validated' | 'withdrawn'
export type PackHumanReview = 'NOT_EXECUTED' | 'PASS' | 'FAIL' | 'TIMEOUT'
export type PackCefrTarget = 'PRE-A1' | 'A1' | 'A1+' | 'A2' | 'A2+' | 'B1' | 'B1+' | 'B2' | 'B2+' | 'C1' | 'C2'

export interface PackEntry {
  entry_id: string
  role: PackRole
  priority: number
  introduced_in?: string
  theme: string
  subtheme?: string
}

export interface LearningPack {
  pack_id: string
  pack_version: string
  audience: PackAudience
  language_pair: string
  framework: string
  framework_version: string
  school_year?: string
  grade?: '6e' | '5e' | '4e' | '3e' | 'seconde' | 'premiere' | 'terminale'
  track?: PackTrack
  cefr_target: PackCefrTarget
  inherits_from: string[]
  themes: string[]
  entries: PackEntry[]
  sources: string[]
  status: PackStatus
  human_review: PackHumanReview
}

export type PackResolutionErrorCode = 'duplicate-pack-id' | 'missing-pack' | 'inheritance-cycle'

export class PackResolutionError extends Error {
  constructor(public readonly code: PackResolutionErrorCode, message: string) {
    super(message)
    this.name = 'PackResolutionError'
  }
}

export interface PackGraphValidationResult {
  valid: boolean
  errors: string[]
}

function buildPackMap(packs: LearningPack[]): Map<string, LearningPack> {
  const map = new Map<string, LearningPack>()
  for (const pack of packs) {
    if (map.has(pack.pack_id)) {
      throw new PackResolutionError('duplicate-pack-id', `Duplicate pack id: ${pack.pack_id}`)
    }
    map.set(pack.pack_id, pack)
  }
  return map
}

function sortResolvedEntries(entries: Iterable<PackEntry>): PackEntry[] {
  return [...entries].sort((left, right) => {
    const priority = left.priority - right.priority
    if (priority !== 0) return priority
    return left.entry_id.localeCompare(right.entry_id)
  })
}

export function resolveLearningPack(packId: string, packs: LearningPack[]): PackEntry[] {
  const packMap = buildPackMap(packs)
  const cache = new Map<string, PackEntry[]>()
  const visiting = new Set<string>()

  const resolve = (id: string, path: string[]): PackEntry[] => {
    const cached = cache.get(id)
    if (cached) return cached

    if (visiting.has(id)) {
      const cycleStart = path.indexOf(id)
      const cycle = [...path.slice(Math.max(0, cycleStart)), id].join(' -> ')
      throw new PackResolutionError('inheritance-cycle', `LearningPack inheritance cycle: ${cycle}`)
    }

    const pack = packMap.get(id)
    if (!pack) throw new PackResolutionError('missing-pack', `Unknown inherited pack: ${id}`)

    visiting.add(id)
    const effective = new Map<string, PackEntry>()

    for (const parentId of pack.inherits_from) {
      for (const entry of resolve(parentId, [...path, id])) effective.set(entry.entry_id, entry)
    }

    for (const entry of pack.entries) effective.set(entry.entry_id, entry)

    visiting.delete(id)
    const resolved = sortResolvedEntries(effective.values())
    cache.set(id, resolved)
    return resolved
  }

  return resolve(packId, [])
}

export function validateLearningPackGraph(
  packs: LearningPack[],
  lexicalEntryIds?: ReadonlySet<string>
): PackGraphValidationResult {
  const errors: string[] = []
  const ids = new Set<string>()

  for (const [index, pack] of packs.entries()) {
    const schema = validateLearningPack(pack)
    if (!schema.valid) errors.push(`pack-schema:${index}:${pack.pack_id ?? 'unknown'}`)

    if (ids.has(pack.pack_id)) errors.push(`duplicate-pack-id:${pack.pack_id}`)
    ids.add(pack.pack_id)

    const directEntries = new Set<string>()
    for (const entry of pack.entries) {
      if (directEntries.has(entry.entry_id)) errors.push(`duplicate-direct-entry:${pack.pack_id}:${entry.entry_id}`)
      directEntries.add(entry.entry_id)
      if (!pack.themes.includes(entry.theme)) errors.push(`entry-theme-not-declared:${pack.pack_id}:${entry.entry_id}:${entry.theme}`)
      if (lexicalEntryIds && !lexicalEntryIds.has(entry.entry_id)) errors.push(`unknown-entry:${pack.pack_id}:${entry.entry_id}`)
    }
  }

  if (errors.some((error) => error.startsWith('duplicate-pack-id:'))) return { valid: false, errors }

  for (const pack of packs) {
    for (const parentId of pack.inherits_from) {
      if (!ids.has(parentId)) errors.push(`missing-parent:${pack.pack_id}:${parentId}`)
    }
  }

  if (!errors.some((error) => error.startsWith('missing-parent:'))) {
    for (const pack of packs) {
      try {
        resolveLearningPack(pack.pack_id, packs)
      } catch (error) {
        if (error instanceof PackResolutionError) errors.push(`${error.code}:${pack.pack_id}`)
        else throw error
      }
    }
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)] }
}
