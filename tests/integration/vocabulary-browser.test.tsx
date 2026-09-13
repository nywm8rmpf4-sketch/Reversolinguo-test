import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IntlProvider } from 'react-intl'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../../src/app/App'
import { VocabularyBrowser } from '../../src/app/VocabularyBrowser'
import { catalog } from '../../src/content/catalog'
import { messages } from '../../src/i18n/messages'
import { db, defaultSettings } from '../../src/storage/database'

function renderBrowser() {
  return render(
    <IntlProvider locale="fr" messages={messages}>
      <VocabularyBrowser entries={catalog} initialDirection="fr-es" onBack={() => undefined} />
    </IntlProvider>
  )
}

describe('vocabulary browser', () => {
  afterEach(async () => {
    cleanup()
    await db.delete()
    await db.open()
  })

  it('shows every active entry grouped by CEFR level and sorted by the displayed source language', async () => {
    const user = userEvent.setup()
    renderBrowser()

    expect(screen.getByRole('heading', { name: 'Vocabulaire' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Niveau A1' })).toBeVisible()
    expect(screen.getAllByRole('listitem')).toHaveLength(catalog.length)

    const frenchCollator = new Intl.Collator('fr', { sensitivity: 'base' })
    const expectedFrenchFirst = catalog.slice().sort((a, b) => frenchCollator.compare(a.fr.join(' · '), b.fr.join(' · ')))[0]
    const firstFrenchRow = screen.getAllByRole('listitem')[0]
    expect(within(firstFrenchRow).getByText(expectedFrenchFirst.fr.join(' · '))).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Espagnol → français' }))
    expect(screen.getByRole('button', { name: 'Espagnol → français' })).toHaveAttribute('aria-pressed', 'true')

    const spanishCollator = new Intl.Collator('es', { sensitivity: 'base' })
    const expectedSpanishFirst = catalog.slice().sort((a, b) => spanishCollator.compare(a.es, b.es))[0]
    const firstSpanishRow = screen.getAllByRole('listitem')[0]
    expect(within(firstSpanishRow).getByText(expectedSpanishFirst.es)).toBeVisible()
  })

  it('exposes both directions without changing learning settings or progress', async () => {
    const user = userEvent.setup()
    await db.settings.put({ ...defaultSettings, onboarded: true, direction: 'fr-es' })
    const beforeSettings = await db.settings.get('settings')
    const beforeReviews = await db.reviews.count()

    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Voir tout le vocabulaire' }))
    expect(await screen.findByText('24 entrées actives, classées par niveau CECRL puis par ordre alphabétique.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Espagnol → français' }))
    expect(screen.getByText('Cette consultation ne modifie ni votre sens d’apprentissage ni votre progression.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: /Retour/u }))
    await user.click(screen.getByRole('button', { name: 'Données et réglages' }))

    expect(screen.getByLabelText('Sens d’apprentissage')).toHaveValue('fr-es')
    expect(await db.settings.get('settings')).toEqual(beforeSettings)
    expect(await db.reviews.count()).toBe(beforeReviews)
  })
})
