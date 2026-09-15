import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IntlProvider } from 'react-intl'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../../src/app/App'
import { VocabularyBrowser } from '../../src/app/VocabularyBrowser'
import { catalog } from '../../src/content/catalog'
import type { LexicalEntry } from '../../src/domain/model'
import { messages } from '../../src/i18n/messages'
import { db, defaultSettings } from '../../src/storage/database'

function renderBrowser(entries: LexicalEntry[] = catalog) {
  return render(
    <IntlProvider locale="fr" messages={messages}>
      <VocabularyBrowser entries={entries} initialDirection="fr-es" onBack={() => undefined} />
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
    const expectedFrenchFirst = catalog.slice().sort((a, b) => frenchCollator.compare(a.targets.join(' · '), b.targets.join(' · ')))[0]
    const firstFrenchRow = screen.getAllByRole('listitem')[0]
    expect(within(firstFrenchRow).getByText(expectedFrenchFirst.targets.join(' · '))).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Espagnol → français' }))
    expect(screen.getByRole('button', { name: 'Espagnol → français' })).toHaveAttribute('aria-pressed', 'true')

    const spanishCollator = new Intl.Collator('es', { sensitivity: 'base' })
    const expectedSpanishFirst = catalog.slice().sort((a, b) => spanishCollator.compare(a.source, b.source))[0]
    const firstSpanishRow = screen.getAllByRole('listitem')[0]
    expect(within(firstSpanishRow).getByText(expectedSpanishFirst.source)).toBeVisible()
  })

  it('orders CEFR groups from PRE-A1 through B2 with language-generic runtime entries', () => {
    const levels: LexicalEntry[] = [
      ['b2', 'B2'], ['a2', 'A2'], ['pre', 'PRE-A1'], ['b1', 'B1'], ['a1', 'A1']
    ].map(([id, level]) => ({
      id,
      source: `es-${id}`,
      targets: [`fr-${id}`],
      sourceLanguage: 'es',
      targetLanguage: 'fr',
      exampleSource: `Ejemplo ${id}`,
      exampleTarget: `Exemple ${id}`,
      level: level as LexicalEntry['level'],
      theme: 'test'
    }))

    renderBrowser(levels)
    const headings = screen.getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent)
      .filter((text) => text?.startsWith('Niveau '))
    expect(headings).toEqual(['Niveau PRE-A1', 'Niveau A1', 'Niveau A2', 'Niveau B1', 'Niveau B2'])
  })

  it('exposes both configured directions without changing learning settings or progress', async () => {
    const user = userEvent.setup()
    await db.settings.put({ ...defaultSettings, onboarded: true, direction: 'fr-es' })
    const beforeSettings = await db.settings.get('settings')
    const beforeReviews = await db.reviews.count()

    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Voir tout le vocabulaire' }))
    expect(await screen.findByText('60 entrées actives, classées par niveau CECRL puis par ordre alphabétique.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Espagnol → français' }))
    expect(screen.getByText('Cette consultation ne modifie ni votre sens d’apprentissage ni votre progression.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: /Retour/u }))
    await user.click(screen.getByRole('button', { name: 'Données et réglages' }))

    expect(screen.getByLabelText('Sens d’apprentissage')).toHaveValue('fr-es')
    expect(await db.settings.get('settings')).toEqual(beforeSettings)
    expect(await db.reviews.count()).toBe(beforeReviews)
  })
})
