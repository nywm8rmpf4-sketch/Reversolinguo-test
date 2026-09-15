import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IntlProvider } from 'react-intl'
import { describe, expect, it, vi } from 'vitest'
import { PathSelector } from '../../src/app/PathSelector'
import { defaultPathPreferences, type PathPreferences } from '../../src/domain/pathSelection'
import { messages } from '../../src/i18n/messages'

function renderSelector(onSave = vi.fn<(preferences: PathPreferences) => void>()) {
  render(
    <IntlProvider locale="fr" messages={messages}>
      <PathSelector initial={defaultPathPreferences} onSave={onSave} onBack={() => undefined} />
    </IntlProvider>
  )
  return onSave
}

describe('PACK-7 path selector UI', () => {
  it('moves from Adult to School, exposes inherited content and persists an optional focus', async () => {
    const user = userEvent.setup()
    const onSave = renderSelector()

    expect(screen.getByRole('heading', { name: 'Choisir un parcours' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Adulte' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('60 entrées effectives · 60 directes · 0 héritées')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Scolaire' }))
    expect(screen.getByRole('button', { name: 'Scolaire' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Classe')).toHaveValue('6e')
    expect(screen.getByLabelText('Langue')).toHaveValue('LVA')
    expect(screen.getByText('25 entrées effectives · 25 directes · 0 héritées')).toBeVisible()

    await user.selectOptions(screen.getByLabelText('Classe'), '5e')
    expect(screen.getByText('25 entrées effectives · 0 directes · 25 héritées')).toBeVisible()
    const schoolFocus = screen.getByRole('checkbox', { name: 'École et études' })
    await user.click(schoolFocus)
    expect(schoolFocus).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Utiliser ce parcours' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toMatchObject({ adultScope: 'cumulative', focusThemeIds: ['ecole-etudes'] })
    expect(onSave.mock.calls[0][0].primaryPackId).toContain('5e-lva')
  })

  it('shows the autonomous Voyage path without presenting a focus override', async () => {
    const user = userEvent.setup()
    renderSelector()
    await user.click(screen.getByRole('button', { name: 'Thème' }))

    expect(screen.getByLabelText('Thème')).toHaveValue('voyage')
    expect(screen.getByText('Voyage · A1')).toBeVisible()
    expect(screen.getByText('4 entrées effectives · 4 directes · 0 héritées')).toBeVisible()
    expect(screen.queryByRole('group', { name: 'Thèmes prioritaires' })).not.toBeInTheDocument()
  })
})
