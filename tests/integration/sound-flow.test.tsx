import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/audio/engine', () => ({ playSound: vi.fn() }))

import App from '../../src/app/App'
import { playSound } from '../../src/audio/engine'
import { db } from '../../src/storage/database'

describe('sound identity integration', () => {
  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('starts a new user in subtle mode and persists a three-state preference', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Français vers espagnol' }))
    await user.click(await screen.findByRole('button', { name: 'Données et réglages' }))

    const soundMode = screen.getByRole('combobox', { name: 'Sons de l’interface' })
    expect(soundMode).toHaveValue('subtle')
    await user.selectOptions(soundMode, 'on')
    await waitFor(async () => expect((await db.settings.get('settings'))?.soundMode).toBe('on'))
    expect(soundMode).toHaveValue('on')

    await user.selectOptions(soundMode, 'off')
    await waitFor(async () => expect((await db.settings.get('settings'))?.soundMode).toBe('off'))
  })

  it('emits cardFlip on reveal and rating feedback only after a successful review write', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Français vers espagnol' }))
    await user.click(await screen.findByRole('button', { name: 'Découvrir maintenant' }))
    const input = await screen.findByRole('textbox', { name: 'Votre réponse' })
    await user.type(input, 'la mano')
    await user.click(screen.getByRole('button', { name: 'Voir la réponse' }))
    expect(playSound).toHaveBeenCalledWith('cardFlip', 'subtle')

    await user.click(screen.getByRole('button', { name: 'Correct' }))
    await waitFor(() => expect(playSound).toHaveBeenCalledWith('correct', 'subtle'))
    expect(await db.reviews.count()).toBe(1)
  })
})
