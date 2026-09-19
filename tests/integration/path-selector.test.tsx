import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IntlProvider } from 'react-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PathSelector } from '../../src/app/PathSelector'
import { adultPackIdFor, defaultPathPreferences, schoolPackIdFor, summarizePath, type PathPreferences } from '../../src/domain/pathSelection'
import { messages } from '../../src/i18n/messages'
import { canonicalCatalogEntries } from '../../src/content/catalog'

afterEach(() => cleanup())

function expectSourceCount(count: number) {
  const compactExpected = `${count}nouveautésdisponiblesavantfiltrethématique`
  expect(screen.getByText((content) => content.replace(/\s/gu, '') === compactExpected)).toBeVisible()
}

function renderSelector(onSave = vi.fn<(preferences: PathPreferences) => void>()) {
  render(
    <IntlProvider locale="fr" messages={messages}>
      <PathSelector initial={defaultPathPreferences} onSave={onSave} onBack={() => undefined} />
    </IntlProvider>
  )
  return onSave
}

describe('PACK-7 R6 selector UI', () => {
  it('selects several CEFR levels, several themes and selection-only recall scope', async () => {
    const user = userEvent.setup()
    const onSave = renderSelector()

    expect(screen.getByRole('heading', { name: 'Choisir mes mots' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'International' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('checkbox', { name: 'A1' })).toBeChecked()

    await user.click(screen.getByRole('checkbox', { name: 'A2' }))
    expect(screen.getByText('International · A1 + A2')).toBeVisible()
    const adultCount = summarizePath({
      audience: 'adult',
      selectedPackIds: [adultPackIdFor('A1'), adultPackIdFor('A2'), adultPackIdFor('B1')],
      selectedThemeIds: [],
      reviewScope: 'all-due'
    }).sourceCount
    expectSourceCount(adultCount)

    const activeB1Count = canonicalCatalogEntries.filter((entry) => entry.status !== 'withdrawn' && entry.cefr_level === 'B1').length
    expect(activeB1Count).toBeGreaterThan(0)
    await user.click(screen.getByRole('checkbox', { name: 'B1' }))
    expect(screen.getByText('International · A1 + A2 + B1')).toBeVisible()
    expectSourceCount(adultCount + activeB1Count)

    const schoolTheme = screen.getByRole('checkbox', { name: /École et études/u })
    const foodTheme = screen.getByRole('checkbox', { name: /Alimentation/u })
    await user.click(schoolTheme)
    await user.click(foodTheme)
    expect(schoolTheme).toBeChecked()
    expect(foodTheme).toBeChecked()

    await user.click(screen.getByRole('radio', { name: 'Uniquement ma sélection' }))
    await user.click(screen.getByRole('button', { name: 'Utiliser cette sélection' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toMatchObject({
      audience: 'adult',
      selectedPackIds: [adultPackIdFor('A1'), adultPackIdFor('A2')],
      selectedThemeIds: ['ecole-etudes', 'alimentation'],
      reviewScope: 'selection-only'
    })
  })

  it('selects several school classes for one track and preserves them when switching LVA to LVB', async () => {
    const user = userEvent.setup()
    renderSelector()

    await user.click(screen.getByRole('button', { name: 'Scolaire' }))
    expect(screen.getByLabelText('Langue')).toHaveValue('LVA')
    expect(screen.getByRole('checkbox', { name: '6e' })).toBeChecked()

    await user.click(screen.getByRole('checkbox', { name: '5e' }))
    expect(screen.getByText('6e LVA + 5e LVA')).toBeVisible()
    const lvaCount = summarizePath({
      audience: 'school',
      selectedPackIds: [schoolPackIdFor('6e', 'LVA'), schoolPackIdFor('5e', 'LVA')],
      selectedThemeIds: [],
      reviewScope: 'all-due'
    }).sourceCount
    expectSourceCount(lvaCount)

    await user.selectOptions(screen.getByLabelText('Langue'), 'LVB')
    expect(screen.getByRole('checkbox', { name: '6e' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '5e' })).toBeChecked()
    expect(screen.getByText('6e LVB + 5e LVB')).toBeVisible()
    const lvbCount = summarizePath({
      audience: 'school',
      selectedPackIds: [schoolPackIdFor('6e', 'LVB'), schoolPackIdFor('5e', 'LVB')],
      selectedThemeIds: [],
      reviewScope: 'all-due'
    }).sourceCount
    expectSourceCount(lvbCount)
  })

  it('supports several levels in the autonomous Voyage path', async () => {
    const user = userEvent.setup()
    renderSelector()
    await user.click(screen.getByRole('button', { name: 'Parcours thématique' }))

    expect(screen.getByLabelText('Thème')).toHaveValue('voyage')
    expect(screen.getByRole('checkbox', { name: 'A1' })).toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: 'A2' }))
    expect(screen.getByText('Voyage · A1 + A2')).toBeVisible()
    expect(screen.queryByRole('group', { name: 'Thèmes' })).not.toBeInTheDocument()
  })
})
