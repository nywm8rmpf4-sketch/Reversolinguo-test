import { useMemo, useState, type ReactNode } from 'react'
import { FormattedMessage } from 'react-intl'
import type { CefrLevel, Direction, LexicalEntry } from '../domain/model'

const levelOrder: CefrLevel[] = ['PRE-A1', 'A1', 'A2', 'B1', 'B2']

function sourceText(entry: LexicalEntry, direction: Direction) {
  return direction === 'fr-es' ? entry.fr.join(' · ') : entry.es
}

function targetText(entry: LexicalEntry, direction: Direction) {
  return direction === 'fr-es' ? entry.es : entry.fr.join(' · ')
}

interface VocabularyBrowserProps {
  entries: LexicalEntry[]
  initialDirection: Direction
  onBack: () => void
  banner?: ReactNode
}

export function VocabularyBrowser({ entries, initialDirection, onBack, banner }: VocabularyBrowserProps) {
  const [direction, setDirection] = useState<Direction>(initialDirection)
  const groups = useMemo(() => {
    const locale = direction === 'fr-es' ? 'fr' : 'es'
    const collator = new Intl.Collator(locale, { sensitivity: 'base' })
    return levelOrder
      .map((level) => ({
        level,
        entries: entries
          .filter((entry) => entry.level === level)
          .toSorted((a, b) => collator.compare(sourceText(a, direction), sourceText(b, direction)))
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
        <div className="direction-switch" role="group" aria-label="Sens d’affichage du vocabulaire">
          <button type="button" aria-pressed={direction === 'fr-es'} onClick={() => setDirection('fr-es')}>
            Français → espagnol
          </button>
          <button type="button" aria-pressed={direction === 'es-fr'} onClick={() => setDirection('es-fr')}>
            Espagnol → français
          </button>
        </div>
        <p className="helper"><FormattedMessage id="vocabularyReadOnly" /></p>
      </section>

      <div className="vocabulary-groups">
        {groups.map((group) => (
          <section className="vocabulary-level" key={group.level} aria-labelledby={`vocabulary-level-${group.level}`}>
            <div className="vocabulary-level-heading">
              <h2 id={`vocabulary-level-${group.level}`}>Niveau {group.level}</h2>
              <span>{group.entries.length} entrée{group.entries.length > 1 ? 's' : ''}</span>
            </div>
            <ul className="vocabulary-list">
              {group.entries.map((entry) => (
                <li key={entry.id}>
                  <span className="vocabulary-source">{sourceText(entry, direction)}</span>
                  <span className="vocabulary-arrow" aria-hidden="true">→</span>
                  <span className="vocabulary-target">{targetText(entry, direction)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  )
}
