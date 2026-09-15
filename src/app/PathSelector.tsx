import { useMemo, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { adultInitialDeliveryLevels, type AdultCefrLevel } from '../content/adultReference'
import type { PackTrack } from '../content/packs'
import type { SchoolGrade } from '../content/schoolReference'
import type { CanonicalThemeId } from '../content/taxonomy'
import { voyageLevels, type ThemePathLevel } from '../content/themePaths'
import {
  adultPackIdFor,
  defaultPathPreferences,
  labelForPath,
  normalizePathPreferences,
  schoolPackIdFor,
  summarizePath,
  themePackIdFor,
  type PathAudience,
  type PathPreferences
} from '../domain/pathSelection'

interface PathSelectorProps {
  initial: PathPreferences
  onSave: (preferences: PathPreferences) => void | Promise<void>
  onBack: () => void
  banner?: React.ReactNode
}

const schoolGrades: SchoolGrade[] = ['6e', '5e', '4e', '3e', 'seconde', 'premiere', 'terminale']
const schoolTracks: Array<Extract<PackTrack, 'LVA' | 'LVB'>> = ['LVA', 'LVB']

export function PathSelector({ initial, onSave, onBack, banner }: PathSelectorProps) {
  const intl = useIntl()
  const [draft, setDraft] = useState<PathPreferences>(() => normalizePathPreferences(initial))
  const summary = useMemo(() => summarizePath(draft), [draft])

  function chooseAudience(audience: PathAudience) {
    const primaryPackId = audience === 'school'
      ? schoolPackIdFor('6e', 'LVA')
      : audience === 'theme'
        ? themePackIdFor('A1')
        : defaultPathPreferences.primaryPackId
    setDraft(normalizePathPreferences({ ...draft, primaryPackId, focusThemeIds: [] }))
  }

  function chooseSchool(grade: SchoolGrade, track: Extract<PackTrack, 'LVA' | 'LVB'>) {
    setDraft(normalizePathPreferences({ ...draft, primaryPackId: schoolPackIdFor(grade, track), focusThemeIds: [] }))
  }

  function toggleFocus(themeId: CanonicalThemeId) {
    const selected = new Set(draft.focusThemeIds)
    if (selected.has(themeId)) selected.delete(themeId)
    else selected.add(themeId)
    setDraft(normalizePathPreferences({ ...draft, focusThemeIds: [...selected] }))
  }

  const grade = (summary.pack.grade ?? '6e') as SchoolGrade
  const track = (summary.pack.track === 'LVB' ? 'LVB' : 'LVA') as Extract<PackTrack, 'LVA' | 'LVB'>

  return (
    <main className="shell">{banner}
      <header className="topbar"><button className="back" onClick={onBack}>← <FormattedMessage id="back" /></button><h1><FormattedMessage id="pathTitle" /></h1></header>
      <section className="panel path-panel" aria-labelledby="path-family-title">
        <h2 id="path-family-title"><FormattedMessage id="pathFamily" /></h2>
        <div className="path-family-grid">
          <button className={summary.audience === 'school' ? 'primary' : 'secondary'} aria-pressed={summary.audience === 'school'} onClick={() => chooseAudience('school')}><FormattedMessage id="pathSchool" /></button>
          <button className={summary.audience === 'adult' ? 'primary' : 'secondary'} aria-pressed={summary.audience === 'adult'} onClick={() => chooseAudience('adult')}><FormattedMessage id="pathAdult" /></button>
          <button className={summary.audience === 'theme' ? 'primary' : 'secondary'} aria-pressed={summary.audience === 'theme'} onClick={() => chooseAudience('theme')}><FormattedMessage id="pathTheme" /></button>
        </div>

        {summary.audience === 'school' && <div className="path-controls">
          <label htmlFor="path-grade"><FormattedMessage id="pathGrade" /></label>
          <select id="path-grade" value={grade} onChange={(event) => chooseSchool(event.target.value as SchoolGrade, track)}>{schoolGrades.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <label htmlFor="path-track"><FormattedMessage id="pathTrack" /></label>
          <select id="path-track" value={track} onChange={(event) => chooseSchool(grade, event.target.value as Extract<PackTrack, 'LVA' | 'LVB'>)}>{schoolTracks.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        </div>}

        {summary.audience === 'adult' && <div className="path-controls">
          <label htmlFor="path-adult-level"><FormattedMessage id="pathLevel" /></label>
          <select id="path-adult-level" value={summary.pack.cefr_target} onChange={(event) => setDraft(normalizePathPreferences({ ...draft, primaryPackId: adultPackIdFor(event.target.value as AdultCefrLevel), focusThemeIds: [] }))}>{adultInitialDeliveryLevels.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <label htmlFor="path-adult-scope"><FormattedMessage id="pathAdultScope" /></label>
          <select id="path-adult-scope" value={draft.adultScope} onChange={(event) => setDraft(normalizePathPreferences({ ...draft, adultScope: event.target.value === 'new-only' ? 'new-only' : 'cumulative', focusThemeIds: [] }))}>
            <option value="cumulative">{intl.formatMessage({ id: 'pathAdultCumulative' })}</option>
            <option value="new-only">{intl.formatMessage({ id: 'pathAdultNewOnly' })}</option>
          </select>
        </div>}

        {summary.audience === 'theme' && <div className="path-controls">
          <label htmlFor="path-theme-name"><FormattedMessage id="pathThemeName" /></label>
          <select id="path-theme-name" value="voyage" disabled><option value="voyage">{intl.formatMessage({ id: 'pathVoyage' })}</option></select>
          <label htmlFor="path-theme-level"><FormattedMessage id="pathLevel" /></label>
          <select id="path-theme-level" value={summary.pack.cefr_target} onChange={(event) => setDraft(normalizePathPreferences({ ...draft, primaryPackId: themePackIdFor(event.target.value as ThemePathLevel), focusThemeIds: [] }))}>{voyageLevels.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        </div>}

        {summary.audience !== 'theme' && summary.availableFocusThemes.length > 0 && <fieldset className="theme-checks"><legend><FormattedMessage id="pathFocusThemes" /></legend><p className="helper"><FormattedMessage id="pathFocusHelper" /></p>{summary.availableFocusThemes.map((theme) => <label className="check" key={theme.id}><input type="checkbox" checked={draft.focusThemeIds.includes(theme.id)} onChange={() => toggleFocus(theme.id)} /> {theme.label_fr}</label>)}</fieldset>}
      </section>

      <section className="panel path-summary" aria-labelledby="path-summary-title">
        <h2 id="path-summary-title"><FormattedMessage id="pathSummary" /></h2>
        <p><strong>{labelForPath(summary)}</strong></p>
        <dl>
          <div><dt><FormattedMessage id="pathFramework" /></dt><dd>{summary.pack.framework}</dd></div>
          <div><dt><FormattedMessage id="pathVersion" /></dt><dd>{summary.pack.framework_version}</dd></div>
          {summary.pack.school_year && <div><dt><FormattedMessage id="pathSchoolYear" /></dt><dd>{summary.pack.school_year}</dd></div>}
          <div><dt><FormattedMessage id="pathTarget" /></dt><dd>{summary.pack.cefr_target}</dd></div>
          <div><dt><FormattedMessage id="pathContent" /></dt><dd><FormattedMessage id="pathContentCount" values={{ count: summary.effectiveCount, direct: summary.directCount, inherited: summary.inheritedCount }} /></dd></div>
        </dl>
        <p className="helper"><FormattedMessage id="pathTargetDisclaimer" /></p>
        {summary.effectiveCount === 0 && <p className="notice" role="status"><FormattedMessage id="pathNoNewContent" /></p>}
      </section>

      <button className="primary large" onClick={() => onSave(normalizePathPreferences(draft))}><FormattedMessage id="pathSave" /></button>
      <p className="privacy"><FormattedMessage id="pathSrsContinuity" /></p>
    </main>
  )
}
