import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IntlProvider } from 'react-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/app/App'
import { VocabularyBrowser } from '../../src/app/VocabularyBrowser'
import { ensureCatalogSchedules } from '../../src/app/bootstrap'
import { catalog } from '../../src/content/catalog'
import { canonicalThemes, themeIdsForEntry, type CanonicalThemeId } from '../../src/content/taxonomy'
import { adultPackIdFor, summarizePath } from '../../src/domain/pathSelection'
import type { LexicalEntry } from '../../src/domain/model'
import { messages } from '../../src/i18n/messages'
import { db, defaultSettings } from '../../src/storage/database'

function renderBrowser(entries: LexicalEntry[] = catalog, onEditSelection = () => undefined) {
  return render(
    <IntlProvider locale="fr" messages={messages}>
      <VocabularyBrowser entries={entries} initialDirection="fr-es" onBack={() => undefined} onEditSelection={onEditSelection} />
    </IntlProvider>
  )
}

describe('R7 selected vocabulary browser', () => {
  afterEach(async () => {
    cleanup()
    await db.delete()
    await db.open()
  })

  it('shows one alphabetical list and sorts by the language displayed on the left', async () => {
    const user = userEvent.setup()
    const entries: LexicalEntry[] = [
      {
        id: 'entry-a', source: 'abeja', targets: ['zèbre'], sourceLanguage: 'es', targetLanguage: 'fr',
        exampleSource: 'Una abeja.', exampleTarget: 'Une abeille.', level: 'A1', theme: 'test'
      },
      {
        id: 'entry-b', source: 'zanahoria', targets: ['abricot'], sourceLanguage: 'es', targetLanguage: 'fr',
        exampleSource: 'Una zanahoria.', exampleTarget: 'Une carotte.', level: 'A1', theme: 'test'
      }
    ]

    renderBrowser(entries)

    expect(screen.getByRole('heading', { name: 'Vocabulaire' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Alphabétique' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(within(screen.getAllByRole('listitem')[0]).getByText('abricot')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Espagnol → français' }))
    expect(screen.getByRole('button', { name: 'Espagnol → français' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(screen.getAllByRole('listitem')[0]).getByText('abeja')).toBeVisible()
  })

  it('groups by canonical themes, exposes accessible collapsible zones and keeps a unique global count', async () => {
    const user = userEvent.setup()
    const multiThemeEntry = catalog.find((entry) => themeIdsForEntry(entry.id).length > 1)
    expect(multiThemeEntry).toBeDefined()
    const entry = multiThemeEntry as LexicalEntry
    const themeIds = themeIdsForEntry(entry.id)
    const { container } = renderBrowser([entry])

    expect(screen.getByText('1 entrée unique sélectionnée.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Par thèmes' }))
    expect(screen.getByRole('button', { name: 'Par thèmes' })).toHaveAttribute('aria-pressed', 'true')
    expect(container.querySelectorAll('details')).toHaveLength(themeIds.length)

    for (const themeId of themeIds) {
      const theme = canonicalThemes.find((candidate) => candidate.id === themeId)
      expect(theme).toBeDefined()
      const summary = screen.getByText(theme!.label_fr).closest('summary')
      expect(summary).not.toBeNull()
      const details = summary!.closest('details')
      expect(details).not.toHaveAttribute('open')
      await user.click(summary!)
      expect(details).toHaveAttribute('open')
      expect(within(details!).getByRole('listitem')).toBeVisible()
      await user.click(summary!)
      expect(details).not.toHaveAttribute('open')
    }
  })

  it('offers an explicit empty state with a route back to selection', async () => {
    const user = userEvent.setup()
    const onEditSelection = vi.fn()
    renderBrowser([], onEditSelection)

    expect(screen.getByRole('heading', { name: 'Aucun mot dans cette sélection' })).toBeVisible()
    expect(screen.getByText('Aucune entrée sélectionnée.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Modifier ma sélection' }))
    expect(onEditSelection).toHaveBeenCalledTimes(1)
  })

  it('projects exactly the persisted R6 selection, ignores all-due for the lexicon and stays read-only', async () => {
    const user = userEvent.setup()
    const preferences = {
      audience: 'adult' as const,
      selectedPackIds: [adultPackIdFor('A1'), adultPackIdFor('A2')],
      selectedThemeIds: ['ecole-etudes', 'alimentation'] as CanonicalThemeId[],
      reviewScope: 'all-due' as const
    }
    const summary = summarizePath(preferences)
    const selectedIds = new Set(summary.selectedNewEntries.map((entry) => entry.entry_id))
    const expectedEntries = catalog.filter((entry) => selectedIds.has(entry.id))
    expect(expectedEntries.length).toBe(summary.selectedNewCount)
    expect(expectedEntries.length).toBeGreaterThan(0)
    expect(expectedEntries.length).toBeLessThan(catalog.length)

    await db.settings.put({
      ...defaultSettings,
      onboarded: true,
      direction: 'fr-es',
      pathAudience: preferences.audience,
      selectedPackIds: preferences.selectedPackIds,
      selectedThemeIds: preferences.selectedThemeIds,
      reviewScope: preferences.reviewScope
    })
    await ensureCatalogSchedules(db)

    render(<App />)
    await screen.findByRole('button', { name: 'Voir le vocabulaire' })
    const beforeSettings = await db.settings.get('settings')
    const beforeSchedules = await db.schedules.toArray()
    const beforeReviews = await db.reviews.toArray()

    await user.click(screen.getByRole('button', { name: 'Voir le vocabulaire' }))
    expect(await screen.findByText(`${expectedEntries.length} entrées uniques sélectionnées.`)).toBeVisible()
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(expectedEntries.length)

    const frenchCollator = new Intl.Collator('fr', { sensitivity: 'base' })
    const expectedSorted = expectedEntries.slice().sort((a, b) => frenchCollator.compare(a.targets.join(' · '), b.targets.join(' · ')))
    expectedSorted.forEach((entry, index) => {
      const prompt = rows[index].querySelector('.vocabulary-source')
      const answer = rows[index].querySelector('.vocabulary-target')
      expect(prompt).toHaveTextContent(entry.targets.join(' · '))
      expect(answer).toHaveTextContent(entry.source)
    })

    await user.click(screen.getByRole('button', { name: 'Espagnol → français' }))
    await user.click(screen.getByRole('button', { name: 'Par thèmes' }))
    const firstTheme = document.querySelector('summary')
    if (firstTheme) await user.click(firstTheme)
    await user.click(screen.getByRole('button', { name: /Retour/u }))

    expect(await db.settings.get('settings')).toEqual(beforeSettings)
    expect(await db.schedules.toArray()).toEqual(beforeSchedules)
    expect(await db.reviews.toArray()).toEqual(beforeReviews)
  })
})
