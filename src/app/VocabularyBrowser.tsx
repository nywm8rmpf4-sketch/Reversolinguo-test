import { useMemo, useState, type ReactNode } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import type { CefrLevel, Direction, LexicalEntry } from '../domain/model'
import { activeLanguagePair, displaySourceLanguage, getDirectionConfig, lexicalValues } from '../i18n/languagePairs'

const levelOrder: CefrLevel[] = ['PRE-A1', 'A1', 'A2', 'B1', 'B2']

function sourceText(entry: LexicalEntry, direction: Direction) {
  return lexicalValues(entry, getDirectionConfig(direction).promptSide).join(' · ')
}

function targetText(entry: LexicalEntry, direction: Direction) {
  return lexicalValues(entry, getDirectionConfig(direction).answerSide).join(' · ')
}

interface VocabularyBrowserProps {
  entries: LexicalEntry[]
  initialDirection: Direction
  onBack: () => void
  banner?: ReactNode
}

export function VocabularyBrowser({ entries, initialDirection, onBack, banner }: VocabularyBrowserProps) {
  const intl = useIntl()
  const [direction, setDirection] = useState<Direction>(initialDirection)
  const groups = useMemo(() => {
    const collator = new Intl.Collator(displaySourceLanguage(direction), { sensitivity: 'base' })
    return levelOrder
      .map((level) => ({
        level,
        entries: entries
          .filter((entry) => entry.level === level)
          .slice()
          .sort((a, b) => collator.compare(sourceText(a, direction), sourceText(b, direction)))
      }))
      .filter((group) => group.entries.length > 0)
  }, [direction, entries])

  return (
    <main className="shell vocabulary-screen">
      {banner}
      <header className="topbar">
        <button className="back" onClick={onBack}>← <FormattedMessage id="back" /></button>
        <h1><FormattedMessage id="vocabularyTitle" /></h1>
      </header>

      <section className="panel vocabulary-controls" aria-labelledby="vocabulary-all-title">
        <h2 id="vocabulary-all-title"><FormattedMessage id="vocabularyAll" /></h2>
        <p className="helper"><FormattedMessage id="vocabularyCount" values={{ count: entries.length }} /></p>
        <div className="direction-switch" role="group" aria-label={intl.formatMessage({ id: 'vocabularyDisplayDirection' })}>
          {activeLanguagePair.directions.map((config) => (
            <button type="button" key={config.id} aria-pressed={direction === config.id} onClick={() => setDirection(config.id)}>
              <FormattedMessage id={config.displayMessageId} />
            </button>
          ))}
        </div>
        <p className="helper"><FormattedMessage id="vocabularyReadOnly" /></p>
      </section>

      <div className="vocabulary-groups">
        {groups.map((group) => (
          <section className="vocabulary-level" key={group.level} aria-labelledby={`vocabulary-level-${group.level}`}>
            <div className="vocabulary-level-heading">
              <h2 id={`vocabulary-level-${group.level}`}><FormattedMessage id="vocabularyLevel" values={{ level: group.level }} /></h2>
              <span><FormattedMessage id="vocabularyLevelCount" values={{ count: group.entries.length }} /></span>
            </div>
            <ul className="vocabulary-list">
              {group.entries.map((entry) => (
                <li key={entry.id}>
                  <span className="vocabulary-source" lang={getDirectionConfig(direction).promptLanguage} dir="auto">{sourceText(entry, direction)}</span>
                  <span className="vocabulary-arrow" aria-hidden="true">→</span>
                  <span className="vocabulary-target" lang={getDirectionConfig(direction).answerLanguage} dir="auto">{targetText(entry, direction)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  )
}
