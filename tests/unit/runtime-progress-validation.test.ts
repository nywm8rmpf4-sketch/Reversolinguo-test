import { describe, expect, it } from 'vitest'
import { validateProgressExport } from '../../src/content/contracts'
import { validateProgressExportRuntime } from '../../src/content/runtimeProgressValidation'

function exportFixture(settings: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    exportedAt: '2026-09-15T07:00:00.000Z',
    schedules: [],
    reviews: [],
    settings: [{ id: 'settings', onboarded: true, direction: 'fr-es', dailyNew: 5, ...settings }]
  }
}

function expectParity(value: unknown, expected: boolean) {
  expect(validateProgressExport(value).valid).toBe(expected)
  expect(validateProgressExportRuntime(value).valid).toBe(expected)
}

describe('CSP-safe runtime progress validation', () => {
  it('matches the AJV contract for certified-style and R6 settings', () => {
    expectParity(exportFixture(), true)
    expectParity(exportFixture({
      pathAudience: 'adult',
      selectedPackIds: ['fr-es-adult-cefr-a1', 'fr-es-adult-cefr-a2'],
      selectedThemeIds: ['voyage', 'alimentation'],
      reviewScope: 'selection-only',
      soundMode: 'subtle'
    }), true)
  })

  it('matches AJV rejection for malformed settings and active extra properties', () => {
    expectParity(exportFixture({ soundMode: 'loud' }), false)
    expectParity(exportFixture({ selectedPackIds: [] }), false)
    expectParity({ ...exportFixture(), html: '<script>alert(1)</script>' }, false)
  })

  it('rejects malformed nested schedules and reviews without code generation', () => {
    const invalidSchedule = {
      ...exportFixture(),
      schedules: [{
        key: 'x:fr-es', entryId: 'x', direction: 'fr-es', state: 'REVIEW', intervalDays: 3,
        dueAt: 'not-a-date', updatedAt: '2026-09-15T07:00:00.000Z', schedulerVersion: 'srs-1'
      }]
    }
    expectParity(invalidSchedule, false)

    const invalidReview = {
      ...exportFixture(),
      reviews: [{
        id: 'r1', scheduleKey: 'x:fr-es', entryId: 'x', direction: 'fr-es', rating: 9,
        reviewedAt: '2026-09-15T07:00:00.000Z', previousDueAt: '2026-09-15T07:00:00.000Z',
        nextDueAt: '2026-09-16T07:00:00.000Z', appVersion: '1.1', catalogVersion: 'x', schedulerVersion: 'srs-1',
        previousState: {
          key: 'x:fr-es', entryId: 'x', direction: 'fr-es', state: 'NEW', intervalDays: 0,
          dueAt: '2026-09-15T07:00:00.000Z', updatedAt: '2026-09-15T07:00:00.000Z', schedulerVersion: 'srs-1'
        }
      }]
    }
    expectParity(invalidReview, false)
  })
})
