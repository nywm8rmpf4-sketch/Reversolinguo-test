import { useMemo, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { adultInitialDeliveryLevels } from '../content/adultReference'
import type { PackTrack } from '../content/packs'
import type { SchoolGrade } from '../content/schoolReference'
import type { CanonicalThemeId } from '../content/taxonomy'
import { voyageLevels } from '../content/themePaths'
import {
  adultPackIdFor,
  defaultPathPreferences,
  labelForPath,
  normalizePathPreferences,
  schoolPackIdFor,
  summarizePath,
  themePackIdFor,
  type PathAudience,
  type PathPreferences,
  type ReviewScope
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
    const selectedPackIds = audience === 'school'
      ? [schoolPackIdFor('6e', 'LVA')]
      : audience === 'theme'
        ? [themePackIdFor('A1')]
        : [...defaultPathPreferences.selectedPackIds]
    setDraft(normalizePathPreferences({ audience, selectedPackIds, selectedThemeIds: [], reviewScope: draft.reviewScope }))
  }

  function updatePacks(selectedPackIds: string[]) {
    if (selectedPackIds.length === 0) return
    const provisional: PathPreferences = { ...draft, selectedPackIds }
    const allowed = new Set(summarizePath({ ...provisional, selectedThemeIds: [] }).availableThemes.map((theme) => theme.id))
    setDraft({ ...provisional, selectedThemeIds: provisional.selectedThemeIds.filter((theme) => allowed.has(theme)) })
  }

  function togglePack(packId: string) {
    const selected = new Set(draft.selectedPackIds)
    if (selected.has(packId)) {
      if (selected.size === 1) return
      selected.delete(packId)
    } else selected.add(packId)
    updatePacks([...selected])
  }

  function toggleTheme(themeId: CanonicalThemeId) {
    const selected = new Set(draft.selectedThemeIds)
    if (selected.has(themeId)) selected.delete(themeId)
    else selected.add(themeId)
    setDraft({ ...draft, selectedThemeIds: [...selected] })
  }

  const schoolTrack = (summary.selectedPacks.find((pack) => pack.audience === 'school')?.track === 'LVB' ? 'LVB' : 'LVA') as Extract<PackTrack, 'LVA' | 'LVB'>
  const selectedSchoolGrades = new Set(summary.selectedPacks.map((pack) => pack.grade).filter((grade): grade is SchoolGrade => Boolean(grade)))

  function changeSchoolTrack(track: Extract<PackTrack, 'LVA' | 'LVB'>) {
    const grades = selectedSchoolGrades.size ? [...selectedSchoolGrades] : ['6e' as SchoolGrade]
    updatePacks(grades.map((grade) => schoolPackIdFor(grade, track)))
  }

  function toggleSchoolGrade(grade: SchoolGrade) {
    togglePack(schoolPackIdFor(grade, schoolTrack))
  }

  function setReviewScope(reviewScope: ReviewScope) {
    setDraft({ ...draft, reviewScope })
  }

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
          <label htmlFor="path-track"><FormattedMessage id="pathTrack" /></label>
          <select id="path-track" value={schoolTrack} onChange={(event) => changeSchoolTrack(event.target.value as Extract<PackTrack, 'LVA' | 'LVB'>)}>{schoolTracks.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <fieldset className="theme-checks"><legend><FormattedMessage id="pathClasses" /></legend>{schoolGrades.map((grade) => {
            const packId = schoolPackIdFor(grade, schoolTrack)
            const checked = draft.selectedPackIds.includes(packId)
            return <label className="check" key={grade}><input type="checkbox" checked={checked} onChange={() => toggleSchoolGrade(grade)} /> {grade}</label>
          })}<p className="helper"><FormattedMessage id="pathAtLeastOne" /></p></fieldset>
        </div>}

        {summary.audience === 'adult' && <fieldset className="theme-checks"><legend><FormattedMessage id="pathLevels" /></legend>{adultInitialDeliveryLevels.map((level) => {
          const packId = adultPackIdFor(level)
          return <label className="check" key={level}><input type="checkbox" checked={draft.selectedPackIds.includes(packId)} onChange={() => togglePack(packId)} /> {level}</label>
        })}<p className="helper"><FormattedMessage id="pathAtLeastOne" /></p></fieldset>}

        {summary.audience === 'theme' && <div className="path-controls">
          <label htmlFor="path-theme-name"><FormattedMessage id="pathThemeName" /></label>
          <select id="path-theme-name" value="voyage" disabled><option value="voyage">{intl.formatMessage({ id: 'pathVoyage' })}</option></select>
          <fieldset className="theme-checks"><legend><FormattedMessage id="pathLevels" /></legend>{voyageLevels.map((level) => {
            const packId = themePackIdFor(level)
            return <label className="check" key={level}><input type="checkbox" checked={draft.selectedPackIds.includes(packId)} onChange={() => togglePack(packId)} /> {level}</label>
          })}<p className="helper"><FormattedMessage id="pathAtLeastOne" /></p></fieldset>
        </div>}

        {summary.audience !== 'theme' && <fieldset className="theme-checks"><legend><FormattedMessage id="pathThemes" /></legend><p className="helper"><FormattedMessage id="pathThemesHelper" /></p>{summary.availableThemes.map((theme) => <label className="check" key={theme.id}><input type="checkbox" checked={draft.selectedThemeIds.includes(theme.id)} onChange={() => toggleTheme(theme.id)} /> {theme.label_fr} <span className="helper">(<FormattedMessage id="pathThemeEntryCount" values={{ count: theme.count }} />)</span></label>)}</fieldset>}

        <fieldset className="theme-checks"><legend><FormattedMessage id="pathReviewScope" /></legend>
          <label className="check"><input type="radio" name="review-scope" checked={draft.reviewScope === 'all-due'} onChange={() => setReviewScope('all-due')} /> <FormattedMessage id="pathReviewAllDue" /></label>
          <p className="helper"><FormattedMessage id="pathReviewAllDueHelper" /></p>
          <label className="check"><input type="radio" name="review-scope" checked={draft.reviewScope === 'selection-only'} onChange={() => setReviewScope('selection-only')} /> <FormattedMessage id="pathReviewSelectionOnly" /></label>
          <p className="helper"><FormattedMessage id="pathReviewSelectionOnlyHelper" /></p>
        </fieldset>
      </section>

      <section className="panel path-summary" aria-labelledby="path-summary-title">
        <h2 id="path-summary-title"><FormattedMessage id="pathSummary" /></h2>
        <p><strong>{labelForPath(summary)}</strong></p>
        <dl>
          <div><dt><FormattedMessage id="pathFramework" /></dt><dd>{summary.frameworks.join(' + ') || '—'}</dd></div>
          <div><dt><FormattedMessage id="pathVersion" /></dt><dd>{summary.frameworkVersions.join(' + ') || '—'}</dd></div>
          <div><dt><FormattedMessage id="pathTarget" /></dt><dd>{summary.cefrTargets.join(' + ') || '—'}</dd></div>
        </dl>
        <p><FormattedMessage id="pathSourceCount" values={{ count: summary.sourceCount }} /></p>
        <p><strong><FormattedMessage id="pathSelectedNewCount" values={{ count: summary.selectedNewCount }} /></strong></p>
        <p className="helper"><FormattedMessage id="pathTargetDisclaimer" /></p>
        {summary.selectedNewCount === 0 && <p className="notice" role="status"><FormattedMessage id="pathNoNewContent" /></p>}
      </section>

      <button className="primary large" onClick={() => onSave(normalizePathPreferences(draft))}><FormattedMessage id="pathSave" /></button>
      <p className="privacy"><FormattedMessage id="pathSrsContinuity" /></p>
    </main>
  )
}
