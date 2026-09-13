import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/app/App'
import { ensureCatalogSchedules } from '../../src/app/bootstrap'
import { db, defaultSettings } from '../../src/storage/database'

const MANO_ID = '69046998-47e6-5570-b469-5a5cc961a97e'
const CASA_ID = '36e27c44-5b63-5024-bd41-81546b1e9191'

describe('R4 unknown answer and exploration', () => {
  afterEach(async () => {
    cleanup()
    vi.restoreAllMocks()
    await db.delete()
    await db.open()
  })

  it('reveals an unknown answer before recording exactly one forgotten review', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Français vers espagnol' }))
    await user.click(await screen.findByRole('button', { name: 'Découvrir maintenant' }))

    await user.click(await screen.findByRole('button', { name: 'Je ne sais pas' }))
    expect(screen.getByText('Réponse révélée')).toBeVisible()
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

  it('unlocks random exploration only after the daily session and keeps exploration neutral', async () => {
    const user = userEvent.setup()
    await db.settings.put({ ...defaultSettings, onboarded: true, dailyNew: 1 })
    await ensureCatalogSchedules(db)
    await db.schedules.where('direction').equals('fr-es').modify((schedule) => {
      if (schedule.entryId !== MANO_ID && schedule.entryId !== CASA_ID) schedule.state = 'SUSPENDED'
    })

    render(<App />)
    expect(await screen.findByRole('button', { name: 'Découvrir maintenant' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Explorer au hasard' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Découvrir maintenant' }))
    await user.click(await screen.findByRole('button', { name: 'Je ne sais pas' }))
    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    expect(await screen.findByRole('heading', { name: 'Séance terminée' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Explorer au hasard' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retour à l’accueil' }))
    expect(await screen.findByRole('button', { name: 'Explorer au hasard' })).toBeVisible()

    const schedulesBefore = await db.schedules.where('direction').equals('fr-es').toArray()
    const reviewsBefore = await db.reviews.toArray()
    await user.click(screen.getByRole('button', { name: 'Explorer au hasard' }))
    expect(await screen.findByText(/Exploration · Traduisez en espagnol/u)).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Je ne sais pas' }))
    expect(screen.getByText('Exploration : vos réponses n’affectent ni les échéances ni les statistiques.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    const answer = screen.getByRole('textbox', { name: 'Votre réponse' })
    await user.type(answer, 'réponse libre')
    await user.click(screen.getByRole('button', { name: 'Voir la réponse' }))
    await user.click(screen.getByRole('button', { name: 'Correct' }))

    expect(await screen.findByRole('heading', { name: 'Exploration terminée' })).toBeVisible()
    expect(screen.getByText('Les mots explorés n’ont modifié ni votre planning ni vos statistiques.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Explorer encore' })).toBeVisible()
    expect(await db.schedules.where('direction').equals('fr-es').toArray()).toEqual(schedulesBefore)
    expect(await db.reviews.toArray()).toEqual(reviewsBefore)
  })
})
