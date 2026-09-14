import { describe, expect, it } from 'vitest'
import { catalogEntries } from '../../src/content/catalog'
import { adultPackId } from '../../src/content/adultReference'
import {
  pack6A1DraftAssignmentProposals,
  pack6A1DraftEntries,
  validatePack6A1Draft
} from '../../src/content/pack6Draft'
import { schoolPacks2026_2027 } from '../../src/content/schoolReference'
import { canonicalThemeIds } from '../../src/content/taxonomy'
import { voyagePackId } from '../../src/content/themePaths'

describe('PACK-6A lexical editorial staging', () => {
  it('keeps the certified runtime catalog at exactly 24 entries', () => {
    expect(catalogEntries).toHaveLength(24)
    const runtimeIds = new Set(catalogEntries.map((entry) => entry.entry_id))
    expect(pack6A1DraftEntries.some((entry) => runtimeIds.has(entry.entry_id))).toBe(false)
  })

  it('stages exactly the 36 ADR-017 candidates without human-review claims', () => {
    expect(pack6A1DraftEntries).toHaveLength(36)
    for (const entry of pack6A1DraftEntries) {
      expect(entry.status).toBe('draft')
      expect(entry.cefr_level).toBe('A1')
      expect(entry.provenance.license).toBe('CC BY 4.0')
      expect('reviewed_by' in entry.provenance).toBe(false)
      expect('reviewed_at' in entry.provenance).toBe(false)
    }
  })

  it('uses only canonical PACK-1 themes in the staging corpus', () => {
    for (const entry of pack6A1DraftEntries) {
      expect(entry.themes.length).toBeGreaterThan(0)
      for (const theme of entry.themes) expect(canonicalThemeIds.has(theme as never)).toBe(true)
    }
  })

  it('passes the complete staging validator', () => {
    expect(validatePack6A1Draft()).toEqual({ valid: true, errors: [] })
  })

  it('proposes every draft for adult A1 without mutating the adult manifest', () => {
    const adultA1 = adultPackId('A1')
    const proposals = pack6A1DraftAssignmentProposals.filter((proposal) => proposal.pack_id === adultA1)
    expect(new Set(proposals.map((proposal) => proposal.entry_id)).size).toBe(36)
    expect(proposals.every((proposal) => proposal.rationale === 'adult-a1-candidate')).toBe(true)
  })

  it('limits school proposals to existing 6e LVA/LVB packs and declared 6e themes', () => {
    const sixieme = schoolPacks2026_2027.filter((pack) => pack.grade === '6e')
    const allowedPackIds = new Set(sixieme.filter((pack) => pack.track === 'LVA' || pack.track === 'LVB').map((pack) => pack.pack_id))
    const allowedThemes = new Set(sixieme.flatMap((pack) => pack.themes))
    const schoolProposals = pack6A1DraftAssignmentProposals.filter((proposal) => proposal.rationale === 'school-theme-alignment')

    expect(schoolProposals.length).toBeGreaterThan(0)
    expect(schoolProposals.every((proposal) => allowedPackIds.has(proposal.pack_id))).toBe(true)
    expect(schoolProposals.every((proposal) => allowedThemes.has(proposal.relation_theme))).toBe(true)
  })

  it('keeps the autonomous Voyage A1 proposal deliberately minimal and explicit', () => {
    const proposals = pack6A1DraftAssignmentProposals.filter((proposal) => proposal.pack_id === voyagePackId('A1'))
    expect(proposals).toHaveLength(4)
    expect(proposals.map((proposal) => proposal.entry_id).sort()).toEqual([
      '4fa70eb3-8cff-57c8-abdc-3c9c397833dc',
      '633c5a80-dc55-59e0-92f5-12209e3d9f5d',
      'da4eb86b-c9e6-591a-b7ed-de2f7248fb7a',
      'fe984172-dd41-546e-ac2e-18f679281f6b'
    ].sort())
    expect(proposals.every((proposal) => proposal.relation_theme === 'voyage')).toBe(true)
    expect(proposals.every((proposal) => proposal.rationale === 'voyage-a1-minimal-utility')).toBe(true)
  })
})
