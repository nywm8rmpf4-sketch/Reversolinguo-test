import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../../src/app/App'
import { db } from '../../src/storage/database'

const MANO_ID = '69046998-47e6-5570-b469-5a5cc961a97e'

describe('accessible learning flow', () => {
  afterEach(async () => { await db.delete(); await db.open() })

  it('onboards without an account and starts a typed recall session', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Français vers espagnol' }))
    await user.click(await screen.findByRole('button', { name: 'Réviser maintenant' }))
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
})
