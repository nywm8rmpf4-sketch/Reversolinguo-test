import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/app/App'
import { ensureCatalogSchedules } from '../../src/app/bootstrap'
import { initialSchedule } from '../../src/domain/scheduler'
import type { ReviewEvent } from '../../src/domain/model'
import { db, defaultSettings } from '../../src/storage/database'

const MANO_ID = '69046998-47e6-5570-b469-5a5cc961a97e'

describe('accessible learning flow', () => {
  afterEach(async () => {
    cleanup()
    vi.restoreAllMocks()
    await db.delete()
    await db.open()
  })

  it('onboards without an account and starts a typed recall session', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Français vers espagnol' }))
    await user.click(await screen.findByRole('button', { name: 'Découvrir maintenant' }))
    const input = await screen.findByRole('textbox', { name: 'Votre réponse' })
    await user.type(input, 'la mano')
    await user.click(screen.getByRole('button', { name: 'Voir la réponse' }))
    expect(screen.getByText('Réponse identique ✓')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Correct' }))
    expect((await db.schedules.get(`${MANO_ID}:fr-es`))?.state).toBe('LEARNING')
    await user.click(await screen.findByRole('button', { name: 'Annuler le dernier rappel' }))
    expect((await db.schedules.get(`${MANO_ID}:fr-es`))?.state).toBe('NEW')
    expect((await db.reviews.toArray())[0].canceledAt).toBeTruthy()
  })

  it('exposes an age-appropriate short notice and a complete French privacy notice', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByText('Votre progression reste sur cet appareil. Aucun compte, publicité ni traceur.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Français vers espagnol' }))
    await user.click(await screen.findByRole('button', { name: 'Données et réglages' }))
    const summary = await screen.findByText('Vie privée — en savoir plus')
    expect(summary).toBeVisible()
    await user.click(summary)
    expect(screen.getByText(/Reversolinguo fonctionne sans compte et sans publicité/u)).toBeVisible()
    expect(screen.getByText(/Votre progression et vos réponses ne sont pas envoyées/u)).toBeVisible()
    expect(screen.getByText(/effacer toutes les données locales/u)).toBeVisible()
  })

  it('hydrates the current catalog for a returning user before showing home', async () => {
    await db.settings.put({ ...defaultSettings, onboarded: true })
    expect(await db.schedules.count()).toBe(0)

    render(<App />)
    expect(await screen.findByRole('button', { name: 'Découvrir maintenant' })).toBeVisible()
    expect(await db.schedules.count()).toBe(48)
  })

  it('does not offer a fake session when every card is scheduled for later', async () => {
    await db.settings.put({ ...defaultSettings, onboarded: true })
    await ensureCatalogSchedules(db)
    const future = new Date(Date.now() + 86_400_000).toISOString()
    await db.schedules.toCollection().modify((schedule) => {
      schedule.state = 'REVIEW'
      schedule.intervalDays = 3
      schedule.dueAt = future
      schedule.updatedAt = new Date().toISOString()
      delete schedule.learningStep
    })

    render(<App />)
    expect(await screen.findByText('Rien à réviser pour le moment. Revenez à la prochaine échéance.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Réviser maintenant' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Découvrir maintenant' })).not.toBeInTheDocument()
    expect(screen.getByText(/aucune séance planifiée/u)).toBeVisible()
  })

  it('keeps removed catalog history but excludes its orphan schedule from active learning', async () => {
    const now = new Date()
    await db.settings.put({ ...defaultSettings, onboarded: true })
    await ensureCatalogSchedules(db)
    const future = new Date(now.getTime() + 86_400_000).toISOString()
    await db.schedules.toCollection().modify((schedule) => {
      schedule.state = 'REVIEW'
      schedule.intervalDays = 3
      schedule.dueAt = future
      schedule.updatedAt = now.toISOString()
      delete schedule.learningStep
    })
    const orphan = { ...initialSchedule('withdrawn-entry', 'fr-es', now), state: 'REVIEW' as const, intervalDays: 3, dueAt: new Date(now.getTime() - 86_400_000).toISOString() }
    await db.schedules.put(orphan)

    render(<App />)
    expect(await screen.findByText('Rien à réviser pour le moment. Revenez à la prochaine échéance.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Réviser maintenant' })).not.toBeInTheDocument()
    expect(await db.schedules.get(orphan.key)).toMatchObject({ entryId: 'withdrawn-entry', state: 'REVIEW' })
  })

  it('explains when new cards are paused instead of offering an empty session', async () => {
    await db.settings.put({ ...defaultSettings, onboarded: true, dailyNew: 0 })
    await ensureCatalogSchedules(db)

    render(<App />)
    expect(await screen.findByText('Les nouveaux mots sont en pause dans vos réglages.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Modifier le quota de nouveaux mots' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Réviser maintenant' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Découvrir maintenant' })).not.toBeInTheDocument()
  })

  it('does not offer a sixth new card after the daily allowance has been used', async () => {
    const now = new Date()
    await db.settings.put({ ...defaultSettings, onboarded: true, dailyNew: 5 })
    await ensureCatalogSchedules(db)
    const reviews: ReviewEvent[] = Array.from({ length: 5 }, (_, index) => {
      const previousState = initialSchedule(`already-introduced-${index}`, 'fr-es', now)
      return {
        id: `daily-${index}`,
        scheduleKey: previousState.key,
        entryId: previousState.entryId,
        direction: 'fr-es',
        rating: 2,
        reviewedAt: now.toISOString(),
        previousDueAt: previousState.dueAt,
        nextDueAt: now.toISOString(),
        appVersion: '0.1.0',
        catalogVersion: 'test',
        schedulerVersion: 'srs-1',
        previousState
      }
    })
    await db.reviews.bulkAdd(reviews)

    render(<App />)
    expect(await screen.findByText('Quota de nouveaux mots atteint pour aujourd’hui. Revenez demain ou attendez les prochaines révisions.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Découvrir maintenant' })).not.toBeInTheDocument()
    expect(screen.getByText(/aucune séance planifiée/u)).toBeVisible()
  })

  it('keeps the card and explains recovery when a review cannot be written', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Français vers espagnol' }))
    await user.click(await screen.findByRole('button', { name: 'Découvrir maintenant' }))
    const input = await screen.findByRole('textbox', { name: 'Votre réponse' })
    await user.type(input, 'la mano')
    await user.click(screen.getByRole('button', { name: 'Voir la réponse' }))
    vi.spyOn(db.reviews, 'add').mockRejectedValueOnce(new Error('simulated storage failure'))

    await user.click(screen.getByRole('button', { name: 'Correct' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible d’enregistrer ce rappel. La carte reste ici. Vérifiez l’espace disponible puis réessayez.')
    expect(screen.getByRole('button', { name: 'Correct' })).toBeVisible()
    expect((await db.schedules.get(`${MANO_ID}:fr-es`))?.state).toBe('NEW')
    expect(await db.reviews.count()).toBe(0)
  })
})