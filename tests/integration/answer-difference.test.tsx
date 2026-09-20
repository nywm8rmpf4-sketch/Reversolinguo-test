import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../../src/app/App'
import { db } from '../../src/storage/database'

describe('visible answer differences', () => {
  afterEach(async () => {
    cleanup()
    await db.delete()
    await db.open()
  })

  it('shows the entered answer, expected answer and article/gender difference while keeping self-rating available', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Français (fr-FR) → Espagnol d’Espagne (es-ES)' }))
    await user.click(await screen.findByRole('button', { name: 'Découvrir maintenant' }))
    const input = await screen.findByRole('textbox', { name: 'Votre réponse' })
    await user.type(input, 'mano')
    await user.click(screen.getByRole('button', { name: 'Voir la réponse' }))

    expect(screen.getByText('Votre réponse : mano')).toBeVisible()
    expect(screen.getByText('Différence d’article ou de genre')).toBeVisible()
    expect(screen.getByText('Réponse attendue : la mano')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Oublié' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Difficile' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Correct' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Facile' })).toBeVisible()
  })
})
