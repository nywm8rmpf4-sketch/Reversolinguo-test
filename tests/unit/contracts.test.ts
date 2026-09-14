import { describe, expect, it } from 'vitest'
import validEntry from '../fixtures/lexical-entry.valid.json'
import invalidEntry from '../fixtures/lexical-entry.invalid.json'
import { validateLexicalEntry, validateProgressExport } from '../../src/content/contracts'

function emptyExport(direction = 'fr-es', settings: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    schedules: [],
    reviews: [],
    settings: [{ id: 'settings', onboarded: true, direction, dailyNew: 5, ...settings }]
  }
}

describe('shared executable contracts', () => {
  it('accepts a representative multilingual lexical entry', () => expect(validateLexicalEntry(validEntry)).toEqual({ valid: true, errors: [] }))
  it('rejects an invalid entry with evidenced errors', () => {
    const result = validateLexicalEntry(invalidEntry)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(3)
  })
  it('requires human review provenance before reviewed or validated status', () => {
    const result = validateLexicalEntry({ ...validEntry, status: 'reviewed' })
    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.keyword === 'required')).toBe(true)
  })
  it('keeps the existing FR-ES export contract valid', () => {
    expect(validateProgressExport(emptyExport('fr-es'))).toEqual({ valid: true, errors: [] })
  })
  it('accepts both the normalized sound mode and the historical sound flag', () => {
    expect(validateProgressExport(emptyExport('fr-es', { soundMode: 'subtle' })).valid).toBe(true)
    expect(validateProgressExport(emptyExport('fr-es', { soundEnabled: true })).valid).toBe(true)
    expect(validateProgressExport(emptyExport('fr-es', { soundMode: 'loud' })).valid).toBe(false)
  })
  it('accepts a future configured direction id without changing historical data', () => {
    expect(validateProgressExport(emptyExport('fr-de'))).toEqual({ valid: true, errors: [] })
  })
  it('rejects malformed direction identifiers', () => {
    expect(validateProgressExport(emptyExport('javascript:bad')).valid).toBe(false)
  })
  it('rejects executable content in a progress import', () => {
    const result = validateProgressExport({ schemaVersion: 1, exportedAt: new Date().toISOString(), schedules: [], reviews: [], settings: [], html: '<script>alert(1)</script>' })
    expect(result.valid).toBe(false)
  })
})
