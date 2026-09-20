import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/app/App'
import { ensureCatalogSchedules } from '../../src/app/bootstrap'
import { summarizePath, themePackIdFor } from '../../src/domain/pathSelection'
import { db, defaultSettings } from '../../src/storage/database'

const MANO_ID = '69046998-47e6-5570-b469-5a5cc961a97e'

describe('R4 unknown answer and exploration', () => {
  afterEach(async () => {
    cleanup()
    vi.restoreAllMocks()
    await db.delete()
    await db.open()
  })

  it('keeps Je ne sais pas active in a scheduled session and records exactly one forgotten review after correction', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Français (fr-FR) → Espagnol d’Espagne (es-ES)' }))
    await user.click(await screen.findByRole('button', { name: 'Découvrir maintenant' }))

    const unknown = await screen.findByRole('button', { name: 'Je ne sais pas' })
    expect(unknown).toBeEnabled()
    await user.click(unknown)
    expect(screen.getByText('À revoir', { selector: '.correction strong' })).toBeVisible()
    expect(screen.getByText(/Réponse révélée/u)).toBeVisible()
    expect(screen.getByRole('heading', { name: 'la mano' })).toBeVisible()
    expect(screen.getByText('Ce rappel sera noté « Oublié » lorsque vous continuerez.')).toBeVisible()
    expect((await db.schedules.get(`${MANO_ID}:fr-es`))?.state).toBe('NEW')
    expect(await db.reviews.count()).toBe(0)

    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    expect((await db.schedules.get(`${MANO_ID}:fr-es`))?.state).toBe('RELEARNING')
    const reviews = await db.reviews.toArray()
    expect(reviews).toHaveLength(1)
    expect(reviews[0].rating).toBe(0)
    expect(reviews[0].entryId).toBe(MANO_ID)
  })

  it('keeps Je ne sais pas active and neutral in free review', async () => {
    const user = userEvent.setup()
    await db.settings.put({ ...defaultSettings, onboarded: true, dailyNew: 0 })
    await ensureCatalogSchedules(db)
    const future = new Date(Date.now() + 86_400_000).toISOString()
    await db.schedules.update(`${MANO_ID}:fr-es`, { state: 'REVIEW', intervalDays: 3, dueAt: future, updatedAt: new Date().toISOString(), learningStep: undefined })
    const before = await db.schedules.get(`${MANO_ID}:fr-es`)

    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Réviser librement' }))
    const unknown = await screen.findByRole('button', { name: 'Je ne sais pas' })
    expect(unknown).toBeEnabled()
    await user.click(unknown)
    expect(screen.getByText('À revoir', { selector: '.correction strong' })).toBeVisible()
    expect(screen.getByText(/Réponse révélée/u)).toBeVisible()
    expect(screen.getByText('Cette révision libre n’a modifié ni vos échéances ni vos statistiques.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    expect(await screen.findByRole('heading', { name: 'Révision libre terminée' })).toBeVisible()
    expect(await db.schedules.get(`${MANO_ID}:fr-es`)).toEqual(before)
    expect(await db.reviews.count()).toBe(0)
  })

  it('exposes exploration only on home after the daily session and keeps Je ne sais pas neutral in exploration', async () => {
    const user = userEvent.setup()
    const selectedPackIds = [themePackIdFor('A1')]
    const selected = summarizePath({
      audience: 'theme',
      selectedPackIds,
      selectedThemeIds: [],
      reviewScope: 'selection-only'
    })
    expect(selected.selectedNewEntries.length).toBeGreaterThanOrEqual(2)
    await db.settings.put({
      ...defaultSettings,
      onboarded: true,
      dailyNew: 1,
      pathAudience: 'theme',
      selectedPackIds,
      selectedThemeIds: [],
      reviewScope: 'selection-only'
    })
    await ensureCatalogSchedules(db)
    const selectedSchedules = (await db.schedules.bulkGet(
      selected.selectedNewEntries.map((entry) => `${entry.entry_id}:fr-es`)
    )).filter((schedule): schedule is NonNullable<typeof schedule> => Boolean(schedule))
    await db.schedules.bulkPut(selectedSchedules.map((schedule, index) => ({
      ...schedule,
      ...(index < 2 ? {} : { state: 'SUSPENDED' as const })
    })))

    render(<App />)
    expect(await screen.findByRole('button', { name: 'Découvrir maintenant' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Explorer au hasard' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Découvrir maintenant' }))
    await user.click(await screen.findByRole('button', { name: 'Je ne sais pas' }))
    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    expect(await screen.findByRole('heading', { name: 'Séance terminée' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /Explorer/u })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retour à l’accueil' }))
    expect(await screen.findByRole('button', { name: 'Explorer au hasard' })).toBeVisible()

    const schedulesBefore = await db.schedules.where('direction').equals('fr-es').toArray()
    const reviewsBefore = await db.reviews.toArray()
    await user.click(screen.getByRole('button', { name: 'Explorer au hasard' }))
    expect(await screen.findByText(/Exploration · Traduisez en espagnol/u)).toBeVisible()

    const explorationUnknown = screen.getByRole('button', { name: 'Je ne sais pas' })
    expect(explorationUnknown).toBeEnabled()
    await user.click(explorationUnknown)
    expect(screen.getByText('Exploration : vos réponses n’affectent ni les échéances ni les statistiques.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    const answer = screen.getByRole('textbox', { name: 'Votre réponse' })
    await user.type(answer, 'réponse libre')
    await user.click(screen.getByRole('button', { name: 'Voir la réponse' }))
    await user.click(screen.getByRole('button', { name: 'Correct' }))

    expect(await screen.findByRole('heading', { name: 'Exploration terminée' })).toBeVisible()
    expect(screen.getByText('Les mots explorés n’ont modifié ni votre planning ni vos statistiques.')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Explorer/u })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retour à l’accueil' })).toBeVisible()
    expect(await db.schedules.where('direction').equals('fr-es').toArray()).toEqual(schedulesBefore)
    expect(await db.reviews.toArray()).toEqual(reviewsBefore)

    await user.click(screen.getByRole('button', { name: 'Retour à l’accueil' }))
    expect(await screen.findByRole('button', { name: 'Explorer au hasard' })).toBeVisible()
  })
})
