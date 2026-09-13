import { describe, expect, it } from 'vitest'
import validEntry from '../fixtures/lexical-entry.valid.json'
import invalidEntry from '../fixtures/lexical-entry.invalid.json'
import { validateLexicalEntry, validateProgressExport } from '../../src/content/contracts'

describe('shared executable contracts', () => {
  it('accepts a representative multilingual lexical entry', () => expect(validateLexicalEntry(validEntry)).toEqual({ valid: true, errors: [] }))
  it('rejects an invalid entry with evidenced errors', () => {
    const result = validateLexicalEntry(invalidEntry)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(3)
  })
  it('rejects executable content in a progress import', () => {
    const result = validateProgressExport({ schemaVersion: 1, exportedAt: new Date().toISOString(), schedules: [], reviews: [], settings: [], html: '<script>alert(1)</script>' })
    expect(result.valid).toBe(false)
  })
})
