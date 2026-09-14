import { afterEach, describe, expect, it } from 'vitest'
import { projectProgressToPack } from '../../src/domain/packProgress'
import { initialSchedule } from '../../src/domain/scheduler'
import { ReversolinguoDatabase } from '../../src/storage/database'
import type { LearningPack, PackEntry } from '../../src/content/packs'
import type { ReviewEvent, ScheduleState } from '../../src/domain/model'

const mano = '69046998-47e6-5570-b469-5a5cc961a97e'
const casa = '36e27c44-5b63-5024-bd41-81546b1e9191'

function entry(entry_id: string, priority: number, role: PackEntry['role']): PackEntry {
  return { entry_id, priority, role, theme: 'communication' }
}

function pack(pack_id: string, entries: PackEntry[], inherits_from: string[] = []): LearningPack {
  return {
    pack_id,
    pack_version: '2026.1',
    audience: 'adult',
    language_pair: 'fr-es',
    framework: 'CEFR',
    framework_version: 'Companion Volume 2020',
    cefr_target: 'A1',
    inherits_from,
    themes: ['communication'],
    entries,
    sources: ['https://www.coe.int/en/web/common-european-framework-reference-languages'],
    status: 'draft',
    human_review: 'NOT_EXECUTED'
  }
}

describe('PACK-2 canonical SRS continuity', () => {
  const names: string[] = []
  afterEach(async () => { for (const name of names.splice(0)) await new ReversolinguoDatabase(name).delete() })

  it('switches pack views without cloning, deleting or resetting a shared schedule and its review history', async () => {
    const database = new ReversolinguoDatabase(`pack-progress-${crypto.randomUUID()}`)
    names.push(database.name)

    const base = initialSchedule(mano, 'fr-es', new Date('2026-09-10T08:00:00Z'))
    const learned: ScheduleState = {
      ...base,
      state: 'REVIEW',
      intervalDays: 21,
      dueAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-09-10T08:05:00.000Z'
    }
    const unrelated = initialSchedule(casa, 'fr-es', new Date('2026-09-10T08:00:00Z'))
    const review: ReviewEvent = {
      id: 'review-shared-1',
      scheduleKey: learned.key,
      entryId: learned.entryId,
      direction: learned.direction,
      rating: 2,
      reviewedAt: '2026-09-10T08:05:00.000Z',
      previousDueAt: base.dueAt,
      nextDueAt: learned.dueAt,
      appVersion: '0.1.0',
      catalogVersion: '2026.09-pilot3',
      schedulerVersion: 'srs-1',
      previousState: base
    }

    await database.schedules.bulkPut([learned, unrelated])
    await database.reviews.put(review)

    const school = pack('school-path', [entry(mano, 10, 'core')])
    const adult = pack('adult-path', [entry(mano, 5, 'reinforcement')])
    const other = pack('other-path', [entry(casa, 1, 'core')])
    const packs = [school, adult, other]

    const schedules = await database.schedules.toArray()
    const reviews = await database.reviews.toArray()
    const persistedShared = schedules.find((item) => item.entryId === mano)

    const schoolView = projectProgressToPack('school-path', packs, schedules, reviews)
    const adultView = projectProgressToPack('adult-path', packs, schedules, reviews)
    const otherView = projectProgressToPack('other-path', packs, schedules, reviews)
    const schoolViewAgain = projectProgressToPack('school-path', packs, schedules, reviews)

    expect(schoolView.schedules).toHaveLength(1)
    expect(adultView.schedules).toHaveLength(1)
    expect(schoolView.reviews).toHaveLength(1)
    expect(adultView.reviews).toHaveLength(1)
    expect(schoolView.schedules[0]).toBe(persistedShared)
    expect(adultView.schedules[0]).toBe(persistedShared)
    expect(schoolView.reviews[0]).toBe(reviews[0])
    expect(adultView.reviews[0]).toBe(reviews[0])
    expect(schoolView.schedules[0]).toMatchObject({ key: `${mano}:fr-es`, state: 'REVIEW', intervalDays: 21 })
    expect(adultView.entries[0]).toMatchObject({ entry_id: mano, role: 'reinforcement', priority: 5 })

    expect(otherView.schedules.map((item) => item.entryId)).toEqual([casa])
    expect(otherView.reviews).toEqual([])
    expect(schoolViewAgain.schedules[0]).toEqual(schoolView.schedules[0])
    expect(schoolViewAgain.reviews[0]).toEqual(schoolView.reviews[0])

    expect(await database.schedules.count()).toBe(2)
    expect(await database.reviews.count()).toBe(1)
    expect(await database.schedules.get(`${mano}:fr-es`)).toEqual(learned)
    expect(await database.reviews.get(review.id)).toEqual(review)
  })

  it('projects inherited entries once while preserving the effective child relation metadata', () => {
    const parent = pack('parent', [entry(mano, 20, 'core')])
    const child = pack('child', [entry(mano, 3, 'reinforcement'), entry(casa, 5, 'extension')], ['parent'])
    const schedules = [
      initialSchedule(mano, 'fr-es', new Date('2026-09-10T08:00:00Z')),
      initialSchedule(casa, 'fr-es', new Date('2026-09-10T08:00:00Z'))
    ]

    const projected = projectProgressToPack('child', [parent, child], schedules, [])

    expect(projected.entries).toEqual([
      entry(mano, 3, 'reinforcement'),
      entry(casa, 5, 'extension')
    ])
    expect(projected.entryIds.size).toBe(2)
    expect(projected.schedules.map((item) => item.entryId).sort()).toEqual([casa, mano].sort())
  })
})
