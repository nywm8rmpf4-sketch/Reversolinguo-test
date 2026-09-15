import { useMemo, useState, type ReactNode } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { canonicalThemes, themeIdsForEntry } from '../content/taxonomy'
import type { Direction, LexicalEntry } from '../domain/model'
import { activeLanguagePair, displaySourceLanguage, getDirectionConfig, lexicalValues } from '../i18n/languagePairs'

type VocabularyView = 'alphabetical' | 'themes'

function sourceText(entry: LexicalEntry, direction: Direction) {
  return lexicalValues(entry, getDirectionConfig(direction).promptSide).join(' · ')
}

function targetText(entry: LexicalEntry, direction: Direction) {
  return lexicalValues(entry, getDirectionConfig(direction).answerSide).join(' · ')
}

function sortVocabularyEntries(entries: LexicalEntry[], direction: Direction) {
  const collator = new Intl.Collator(displaySourceLanguage(direction), { sensitivity: 'base' })
  return entries.slice().sort((a, b) => collator.compare(sourceText(a, direction), sourceText(b, direction)))
}

function vocabularyThemeGroups(entries: LexicalEntry[], direction: Direction) {
  const sorted = sortVocabularyEntries(entries, direction)
  return canonicalThemes
    .map((theme) => ({
      theme,
      entries: sorted.filter((entry) => themeIdsForEntry(entry.id).includes(theme.id))
    }))
    .filter((group) => group.entries.length > 0)
}

interface VocabularyBrowserProps {
  entries: LexicalEntry[]
  initialDirection: Direction
  onBack: () => void
  onEditSelection?: () => void
  banner?: ReactNode
}

function VocabularyList({ entries, direction }: { entries: LexicalEntry[]; direction: Direction }) {
  return (
    <ul className="vocabulary-list">
      {entries.map((entry) => (
        <li key={entry.id}>
          <span className="vocabulary-source" lang={getDirectionConfig(direction).promptLanguage} dir="auto">{sourceText(entry, direction)}</span>
          <span className="vocabulary-arrow" aria-hidden="true">→</span>
          <span className="vocabulary-target" lang={getDirectionConfig(direction).answerLanguage} dir="auto">{targetText(entry, direction)}</span>
        </li>
      ))}
    </ul>
  )
}

export function VocabularyBrowser({ entries, initialDirection, onBack, onEditSelection, banner }: VocabularyBrowserProps) {
  const intl = useIntl()
  const [direction, setDirection] = useState<Direction>(initialDirection)
  const [view, setView] = useState<VocabularyView>('alphabetical')
  const sortedEntries = useMemo(() => sortVocabularyEntries(entries, direction), [direction, entries])
  const themeGroups = useMemo(() => vocabularyThemeGroups(entries, direction), [direction, entries])

  return (
    <main className="shell vocabulary-screen">
      {banner}
      <header className="topbar">
        <button className="back" onClick={onBack}>← <FormattedMessage id="back" /></button>
        <h1><FormattedMessage id="vocabularyTitle" /></h1>
      </header>

      <section className="panel vocabulary-controls" aria-labelledby="vocabulary-selection-title">
        <h2 id="vocabulary-selection-title"><FormattedMessage id="vocabularyAll" /></h2>
        <p className="helper"><FormattedMessage id="vocabularyCount" values={{ count: entries.length }} /></p>
        <div className="direction-switch" role="group" aria-label={intl.formatMessage({ id: 'vocabularyView' })}>
          <button type="button" aria-pressed={view === 'alphabetical'} onClick={() => setView('alphabetical')}>
            <FormattedMessage id="vocabularyViewAlphabetical" />
          </button>
          <button type="button" aria-pressed={view === 'themes'} onClick={() => setView('themes')}>
            <FormattedMessage id="vocabularyViewThemes" />
          </button>
        </div>
        <div className="direction-switch" role="group" aria-label={intl.formatMessage({ id: 'vocabularyDisplayDirection' })}>
          {activeLanguagePair.directions.map((config) => (
            <button type="button" key={config.id} aria-pressed={direction === config.id} onClick={() => setDirection(config.id)}>
              <FormattedMessage id={config.displayMessageId} />
            </button>
          ))}
        </div>
        <p className="helper"><FormattedMessage id="vocabularyReadOnly" /></p>
      </section>

      {entries.length === 0 ? (
        <section className="panel">
          <h2><FormattedMessage id="vocabularyEmptyTitle" /></h2>
          <p><FormattedMessage id="vocabularyEmpty" /></p>
          {onEditSelection && <button className="secondary" onClick={onEditSelection}><FormattedMessage id="vocabularyEditSelection" /></button>}
        </section>
      ) : view === 'alphabetical' ? (
        <section className="vocabulary-level" aria-labelledby="vocabulary-alphabetical-title">
          <div className="vocabulary-level-heading">
            <h2 id="vocabulary-alphabetical-title"><FormattedMessage id="vocabularyViewAlphabetical" /></h2>
            <span><FormattedMessage id="vocabularyLevelCount" values={{ count: sortedEntries.length }} /></span>
          </div>
          <VocabularyList entries={sortedEntries} direction={direction} />
        </section>
      ) : (
        <div className="vocabulary-groups">
          {themeGroups.map((group) => (
            <details className="vocabulary-level" key={group.theme.id}>
              <summary className="vocabulary-level-heading">
                <span className="vocabulary-theme-title">{group.theme.label_fr}</span>
                <span><FormattedMessage id="vocabularyLevelCount" values={{ count: group.entries.length }} /></span>
              </summary>
              <VocabularyList entries={group.entries} direction={direction} />
            </details>
          ))}
        </div>
      )}
    </main>
  )
}
