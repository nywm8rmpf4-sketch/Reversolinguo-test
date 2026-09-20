import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/content/taxonomy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/content/taxonomy')>()
  return { ...actual, themeIdsForEntry: () => [] }
})

import App from '../../src/app/App'
import { db } from '../../src/storage/database'

describe('neutral flashcard fallback', () => {
  afterEach(async () => {
    cleanup()
    await db.delete()
    await db.open()
  })

  it('keeps a card fully usable when no canonical theme is recognized', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Français (fr-FR) → Espagnol d’Espagne (es-ES)' }))
    await user.click(await screen.findByRole('button', { name: 'Découvrir maintenant' }))

    const card = document.querySelector<HTMLElement>('.flashcard')
    expect(card).toHaveAttribute('data-theme', 'neutral')
    expect(card?.style.getPropertyValue('--flashcard-theme-image')).toBe('')
    expect(screen.queryByText(/^Thème\s*:/u)).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'la main' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Votre réponse' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Je ne sais pas' })).toBeEnabled()
  })
})
