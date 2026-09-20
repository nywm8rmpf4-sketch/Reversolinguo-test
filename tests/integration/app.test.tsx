import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/app/App'
import { ensureCatalogSchedules } from '../../src/app/bootstrap'
import { catalog } from '../../src/content/catalog'
import { activeLanguagePair } from '../../src/i18n/languagePairs'
import { initialSchedule } from '../../src/domain/scheduler'
import { summarizePath, themePackIdFor } from '../../src/domain/pathSelection'
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
    await user.click(await screen.findByRole('button', { name: 'Français (fr-FR) → Espagnol d’Espagne (es-ES)' }))
    await user.click(await screen.findByRole('button', { name: 'Découvrir maintenant' }))
    expect(await screen.findByText('Français (fr-FR) → Espagnol d’Espagne (es-ES)')).toBeVisible()
    expect(screen.getByText(/Carte 1 sur \d+/u)).toBeVisible()
    expect(screen.getByText('Nouveau')).toBeVisible()
    expect(document.querySelector('.flashcard')).toHaveAttribute('data-theme', 'corps-sante')
    expect(screen.getByText('Thème : Corps et santé')).toBeVisible()
    const input = await screen.findByRole('textbox', { name: 'Votre réponse' })
    await user.type(input, 'la mano')
    await user.click(screen.getByRole('button', { name: 'Voir la réponse' }))
    expect(screen.getByText('Correct', { selector: '.correction strong' })).toBeVisible()
    expect(screen.getByText(/Réponse identique/u)).toBeVisible()
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
    await user.click(screen.getByRole('button', { name: 'Français (fr-FR) → Espagnol d’Espagne (es-ES)' }))
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
    expect(await db.schedules.count()).toBe(catalog.length * activeLanguagePair.directions.length)
  })

  it('keeps the learning direction visible on home and persists a one-tap change', async () => {
    const user = userEvent.setup()
    await db.settings.put({ ...defaultSettings, onboarded: true, direction: 'fr-es' })

    render(<App />)
    const directionGroup = await screen.findByRole('group', { name: 'Sens d’apprentissage' })
    const frEs = screen.getByRole('button', { name: 'Français (fr-FR) → Espagnol d’Espagne (es-ES)' })
    const esFr = screen.getByRole('button', { name: 'Espagnol d’Espagne (es-ES) → Français (fr-FR)' })
    expect(directionGroup).toContainElement(frEs)
    expect(frEs).toHaveAttribute('aria-pressed', 'true')

    await user.click(esFr)
    await waitFor(() => expect(esFr).toHaveAttribute('aria-pressed', 'true'))
    await waitFor(async () => expect((await db.settings.get('settings'))?.direction).toBe('es-fr'))
    expect(screen.getByText('Chaque sens conserve sa propre progression.')).toBeVisible()
  })

  it('keeps direction information non-interactive during a session', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Français (fr-FR) → Espagnol d’Espagne (es-ES)' }))
    await user.click(await screen.findByRole('button', { name: 'Découvrir maintenant' }))

    expect(await screen.findByText('Français (fr-FR) → Espagnol d’Espagne (es-ES)')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Changer de sens/u })).not.toBeInTheDocument()
    expect((await db.settings.get('settings'))?.direction).toBe('fr-es')
  })

  it('shows the ADR-038 context before revealing an ambiguous Spanish prompt', async () => {
    const user = userEvent.setup()
    const salsaDanceId = 'd45f1a20-8bc3-548f-bafb-22a594b9fd2e'
    await db.settings.put({
      ...defaultSettings,
      onboarded: true,
      direction: 'es-fr',
      pathAudience: 'adult',
      selectedPackIds: ['fr-es-adult-cefr-a2'],
      selectedThemeIds: [],
      reviewScope: 'selection-only',
      dailyNew: 0
    })
    await ensureCatalogSchedules(db)
    await db.schedules.update(`${salsaDanceId}:es-fr`, {
      state: 'REVIEW',
      intervalDays: 3,
      dueAt: new Date(Date.now() - 60_000).toISOString(),
      updatedAt: new Date().toISOString(),
      learningStep: undefined
    })

    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Réviser maintenant' }))
    expect(await screen.findByRole('heading', { name: 'la salsa' })).toBeVisible()
    expect(screen.getByText('Bailamos salsa en la fiesta.')).toBeVisible()
    expect(screen.queryByText('la salsa (danse / musique)')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voir la réponse' })).toBeVisible()
  })

  it('offers free review instead of a fake scheduled session when every studied card is scheduled for later', async () => {
    const selectedPackIds = [themePackIdFor('A1')]
    const selected = summarizePath({ audience: 'theme', selectedPackIds, selectedThemeIds: [], reviewScope: 'selection-only' })
    await db.settings.put({
      ...defaultSettings,
      onboarded: true,
      pathAudience: 'theme',
      selectedPackIds,
      selectedThemeIds: [],
      reviewScope: 'selection-only'
    })
    await ensureCatalogSchedules(db)
    const future = new Date(Date.now() + 86_400_000).toISOString()
    const currentSchedules = (await db.schedules.bulkGet(selected.selectedNewEntries.map((entry) => `${entry.entry_id}:fr-es`))).filter((schedule): schedule is NonNullable<typeof schedule> => Boolean(schedule))
    await db.schedules.bulkPut(currentSchedules.map((schedule) => ({
      ...schedule,
      state: 'REVIEW' as const,
      intervalDays: 3,
      dueAt: future,
      updatedAt: new Date().toISOString(),
      learningStep: undefined
    })))

    render(<App />)
    expect(await screen.findByText('Rien à réviser selon le planning pour le moment. Vous pouvez réviser librement ou revenir à la prochaine échéance.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Réviser maintenant' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Découvrir maintenant' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Réviser librement' })).toBeVisible()
    expect(screen.getByText(/aucune séance planifiée/u)).toBeVisible()
  })

  it('offers a focused free review for cards in relearning', async () => {
    const user = userEvent.setup()
    await db.settings.put({ ...defaultSettings, onboarded: true, dailyNew: 0 })
    await ensureCatalogSchedules(db)
    await db.schedules.update(`${MANO_ID}:fr-es`, {
      state: 'RELEARNING',
      learningStep: 0,
      intervalDays: 0,
      dueAt: new Date(Date.now() + 600_000).toISOString(),
      updatedAt: new Date().toISOString()
    })

    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Cartes en difficulté' })).toBeVisible()
    const focusedReview = await screen.findByRole('button', { name: 'Revoir librement' })
    expect(focusedReview).toBeVisible()
    await user.click(focusedReview)

    expect(await screen.findByRole('heading', { name: 'la main' })).toBeVisible()
    expect(screen.getByText(/Révision libre · Traduisez en espagnol/u)).toBeVisible()
  })

  it('replays a studied card freely without changing SRS state or statistics', async () => {
    const user = userEvent.setup()
    await db.settings.put({ ...defaultSettings, onboarded: true, dailyNew: 0 })
    await ensureCatalogSchedules(db)
    const future = new Date(Date.now() + 86_400_000).toISOString()
    await db.schedules.update(`${MANO_ID}:fr-es`, { state: 'REVIEW', intervalDays: 3, dueAt: future, updatedAt: new Date().toISOString(), learningStep: undefined })
    const before = await db.schedules.get(`${MANO_ID}:fr-es`)

    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Réviser librement' }))
    expect(await screen.findByText(/Révision libre · Traduisez en espagnol/u)).toBeVisible()
    const input = screen.getByRole('textbox', { name: 'Votre réponse' })
    await user.type(input, 'la mano')
    await user.click(screen.getByRole('button', { name: 'Voir la réponse' }))
    expect(screen.getByText('Cette révision libre n’a modifié ni vos échéances ni vos statistiques.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Correct' }))

    expect(await screen.findByRole('button', { name: 'Rejouer librement' })).toBeVisible()
    expect(await db.schedules.get(`${MANO_ID}:fr-es`)).toEqual(before)
    expect(await db.reviews.count()).toBe(0)
  })

  it('keeps removed catalog history but excludes its orphan schedule from active learning', async () => {
    const now = new Date()
    const selectedPackIds = [themePackIdFor('A1')]
    const selected = summarizePath({ audience: 'theme', selectedPackIds, selectedThemeIds: [], reviewScope: 'selection-only' })
    await db.settings.put({
      ...defaultSettings,
      onboarded: true,
      pathAudience: 'theme',
      selectedPackIds,
      selectedThemeIds: [],
      reviewScope: 'selection-only'
    })
    await ensureCatalogSchedules(db)
    const future = new Date(now.getTime() + 86_400_000).toISOString()
    const activeSchedules = (await db.schedules.bulkGet(selected.selectedNewEntries.map((entry) => `${entry.entry_id}:fr-es`))).filter((schedule): schedule is NonNullable<typeof schedule> => Boolean(schedule))
    await db.schedules.bulkPut(activeSchedules.map((schedule) => ({
      ...schedule,
      state: 'REVIEW' as const,
      intervalDays: 3,
      dueAt: future,
      updatedAt: now.toISOString(),
      learningStep: undefined
    })))
    const orphan = { ...initialSchedule('withdrawn-entry', 'fr-es', now), state: 'REVIEW' as const, intervalDays: 3, dueAt: new Date(now.getTime() - 86_400_000).toISOString() }
    await db.schedules.put(orphan)

    render(<App />)
    expect(await screen.findByText('Rien à réviser selon le planning pour le moment. Vous pouvez réviser librement ou revenir à la prochaine échéance.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Réviser maintenant' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Réviser librement' })).toBeVisible()
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
    expect(screen.queryByRole('button', { name: 'Réviser librement' })).not.toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: 'Réviser librement' })).not.toBeInTheDocument()
    expect(screen.getByText(/aucune séance planifiée/u)).toBeVisible()
  })

  it('keeps the card and explains recovery when a review cannot be written', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Français (fr-FR) → Espagnol d’Espagne (es-ES)' }))
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
