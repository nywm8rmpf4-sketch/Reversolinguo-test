import { useEffect, useMemo, useState } from 'react'
import { FormattedMessage, IntlProvider, useIntl } from 'react-intl'
import { ensureCatalogSchedules } from './bootstrap'
import { PathSelector } from './PathSelector'
import { PrivacyNotice } from './PrivacyNotice'
import { VocabularyBrowser } from './VocabularyBrowser'
import { catalog, catalogVersion } from '../content/catalog'
import type { CanonicalThemeId } from '../content/taxonomy'
import { appVersion } from '../config/version'
import { bestAnswerDifference } from '../domain/answerDiff'
import { hasActiveReviewToday, randomExplorationSession } from '../domain/exploration'
import { labelForPath, normalizePathPreferences, summarizePath } from '../domain/pathSelection'
import { summarizeProgress, type ProgressSummary } from '../domain/progress'
import { remainingDailyNew, reviewSchedule } from '../domain/scheduler'
import { entryIdsForReviewScope, orderSelectedSession, reviewsForSelection, statesForSelection } from '../domain/selectionSession'
import type { Direction, Rating, ReviewEvent, ScheduleState } from '../domain/model'
import { activeLanguagePair, examplesFor, expectedFor, getDirectionConfig, promptFor } from '../i18n/languagePairs'
import { db, defaultSettings, exportProgress, importProgress, resetProgress, type SettingsRecord } from '../storage/database'
import { messages } from '../i18n/messages'
import { applyServiceWorkerUpdate } from '../pwa/update'
import { playSound } from '../audio/engine'
import { isSoundMode, type SoundEvent } from '../audio/model'
import '../ui/styles.css'

type Screen = 'loading' | 'onboarding' | 'home' | 'paths' | 'session' | 'settings' | 'vocabulary' | 'complete'
type SessionMode = 'scheduled' | 'free' | 'exploration'
type MessageId = keyof typeof messages

const emptyProgress: ProgressSummary = { total: 0, newCount: 0, dueCount: 0, learningCount: 0, consolidatedCount: 0, coveragePercent: 0, recallRate30d: null, effortPoints: 0, activeDays7: 0 }
const catalogThemes = new Map(catalog.map((item) => [item.id, item.theme]))
const catalogEntryIds = new Set(catalog.map((item) => item.id))
const ratingSound: Record<Rating, SoundEvent> = { 0: 'forgotten', 1: 'hard', 2: 'correct', 3: 'easy' }

function challenge(summary: ProgressSummary, configuredDailyNew: number, remainingNew: number, freeReviewAvailable: boolean): { id: MessageId; values?: { count: number } } {
  if (summary.dueCount > 0) return { id: 'challengeDue', values: { count: Math.min(3, summary.dueCount) } }
  if (summary.newCount > 0 && remainingNew > 0) return { id: 'challengeNew', values: { count: Math.min(2, summary.newCount, remainingNew) } }
  if (summary.newCount > 0 && configuredDailyNew === 0) return { id: freeReviewAvailable ? 'challengePausedFree' : 'challengePaused' }
  if (summary.newCount > 0) return { id: freeReviewAvailable ? 'challengeQuotaFree' : 'challengeQuota' }
  if (freeReviewAvailable) return { id: 'challengeFree' }
  return { id: 'challengeNone' }
}

function completionFeedback(settings: SettingsRecord) {
  if (settings.vibrationEnabled && 'vibrate' in navigator) navigator.vibrate(35)
  playSound('sessionComplete', settings.soundMode)
}

function AppContent() {
  const intl = useIntl()
  const [screen, setScreen] = useState<Screen>('loading')
  const [settings, setSettings] = useState<SettingsRecord>(defaultSettings)
  const [queue, setQueue] = useState<ScheduleState[]>([])
  const [sessionTotal, setSessionTotal] = useState(0)
  const [sessionMode, setSessionMode] = useState<SessionMode>('scheduled')
  const [completedSessionKeys, setCompletedSessionKeys] = useState<string[]>([])
  const [answer, setAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [unknownAnswer, setUnknownAnswer] = useState(false)
  const [notice, setNotice] = useState('')
  const [lastReview, setLastReview] = useState<ReviewEvent | null>(null)
  const [offlineReady, setOfflineReady] = useState(false)
  const [progress, setProgress] = useState<ProgressSummary>(emptyProgress)
  const [newRemainingToday, setNewRemainingToday] = useState(defaultSettings.dailyNew)
  const [freeReviewAvailable, setFreeReviewAvailable] = useState(false)
  const [dailySessionCompleted, setDailySessionCompleted] = useState(false)
  const [storageSize, setStorageSize] = useState<string | null>(null)
  const [updateReady, setUpdateReady] = useState(false)

  const pathPreferences = useMemo(() => normalizePathPreferences({
    audience: settings.pathAudience,
    selectedPackIds: settings.selectedPackIds,
    selectedThemeIds: settings.selectedThemeIds as CanonicalThemeId[],
    reviewScope: settings.reviewScope
  }), [settings.pathAudience, settings.selectedPackIds, settings.selectedThemeIds, settings.reviewScope])
  const pathSummary = useMemo(() => summarizePath(pathPreferences), [pathPreferences])
  const reviewEntryIds = useMemo(() => entryIdsForReviewScope(pathSummary.selectedNewEntries, catalogEntryIds, pathPreferences.reviewScope), [pathSummary, pathPreferences.reviewScope])

  useEffect(() => {
    let active = true
    db.settings.get('settings').then(async (saved) => {
      if (!active) return
      if (saved?.onboarded) {
        await ensureCatalogSchedules(db)
        if (!active) return
        setSettings({ ...defaultSettings, ...saved })
        setScreen('home')
      } else setScreen('onboarding')
    }).catch(() => {
      if (active) setScreen('onboarding')
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.ready.then(() => setOfflineReady(true)).catch(() => setOfflineReady(false))
    const ready = () => setUpdateReady(true)
    window.addEventListener('reversolinguo:update-ready', ready)
    return () => window.removeEventListener('reversolinguo:update-ready', ready)
  }, [])

  useEffect(() => {
    if (screen !== 'home') return
    Promise.all([
      db.schedules.where('direction').equals(settings.direction).toArray(),
      db.reviews.filter((item) => item.direction === settings.direction).toArray()
    ]).then(([states, reviews]) => {
      const now = new Date()
      const activeStates = statesForSelection(states, pathSummary.selectedNewEntries, catalogEntryIds, pathPreferences.reviewScope)
      const activeReviews = reviewsForSelection(reviews, pathSummary.selectedNewEntries, catalogEntryIds, pathPreferences.reviewScope)
      const summary = summarizeProgress(activeStates, activeReviews, now)
      const remainingNew = remainingDailyNew(reviews, settings.direction, now, settings.dailyNew)
      const planned = summary.dueCount + Math.min(summary.newCount, remainingNew)
      setProgress(summary)
      setNewRemainingToday(remainingNew)
      setFreeReviewAvailable(activeStates.some((state) => state.state !== 'NEW' && state.state !== 'SUSPENDED'))
      setDailySessionCompleted(hasActiveReviewToday(activeReviews, settings.direction, reviewEntryIds, now) && planned === 0)
    })
  }, [screen, settings.direction, settings.dailyNew, pathSummary, pathPreferences.reviewScope, reviewEntryIds])

  useEffect(() => {
    if (screen !== 'settings' || !navigator.storage?.estimate) return
    navigator.storage.estimate().then(({ usage }) => setStorageSize(`${Math.ceil((usage ?? 0) / 1024)} ko`)).catch(() => setStorageSize(null))
  }, [screen])

  const updateBanner = updateReady && screen !== 'session' ? <aside className="update-banner"><span><FormattedMessage id="updateReady" /></span><button onClick={() => applyServiceWorkerUpdate()}><FormattedMessage id="updateNow" /></button></aside> : null
  const current = queue[0]
  const entry = useMemo(() => catalog.find((item) => item.id === current?.entryId), [current])
  const directionConfig = current ? getDirectionConfig(current.direction) : null
  const expected = entry && current ? expectedFor(entry, current.direction) : []
  const prompt = entry && current ? promptFor(entry, current.direction) : ''
  const comparison = directionConfig && answer.trim() ? bestAnswerDifference(answer, expected, directionConfig.answerLanguage) : { expected: expected[0] ?? '', difference: 'spelling' as const }
  const answerMatches = comparison.difference === 'exact'
  const examples = entry && current ? examplesFor(entry, current.direction) : null

  async function persistSettings(patch: Partial<SettingsRecord>) {
    const next: SettingsRecord = { ...settings, ...patch, id: 'settings' }
    await db.settings.put(next); setSettings(next)
  }

  async function begin(direction: Direction) {
    const nextSettings: SettingsRecord = { ...settings, onboarded: true, direction }
    await ensureCatalogSchedules(db)
    await db.settings.put(nextSettings)
    setSettings(nextSettings); setNotice(''); setScreen('home')
  }

  async function savePath(next: typeof pathPreferences) {
    await persistSettings({
      pathAudience: next.audience,
      selectedPackIds: next.selectedPackIds,
      selectedThemeIds: next.selectedThemeIds,
      reviewScope: next.reviewScope
    })
    setNotice('')
    setScreen('home')
  }

  function openSession(session: ScheduleState[], mode: SessionMode) {
    setSessionMode(mode)
    setCompletedSessionKeys(session.map((state) => state.key))
    setLastReview(null)
    setNotice('')
    setQueue(session)
    setSessionTotal(session.length)
    setAnswer('')
    setRevealed(false)
    setUnknownAnswer(false)
    setScreen('session')
  }

  async function startSession() {
    const now = new Date()
    const [all, reviews] = await Promise.all([
      db.schedules.where('direction').equals(settings.direction).toArray(),
      db.reviews.filter((item) => item.direction === settings.direction).toArray()
    ])
    const selectedOrder = new Map(pathSummary.selectedNewEntries.map((item, index) => [item.entry_id, index]))
    all.sort((a, b) => (selectedOrder.get(a.entryId) ?? Number.MAX_SAFE_INTEGER) - (selectedOrder.get(b.entryId) ?? Number.MAX_SAFE_INTEGER))
    const remainingNew = remainingDailyNew(reviews, settings.direction, now, settings.dailyNew)
    const session = orderSelectedSession(all, pathSummary.selectedNewEntries, catalogEntryIds, pathPreferences.reviewScope, now, remainingNew, catalogThemes)
    if (!session.length) {
      setNotice(intl.formatMessage({ id: 'noCardsAvailable' }))
      setScreen('home')
      return
    }
    openSession(session, 'scheduled')
  }

  async function startFreeReview(preferredKeys?: string[]) {
    const all = await db.schedules.where('direction').equals(settings.direction).toArray()
    const preferred = preferredKeys ? new Set(preferredKeys) : null
    const catalogOrder = new Map(catalog.map((item, index) => [item.id, index]))
    const eligible = all.filter((state) => reviewEntryIds.has(state.entryId) && state.state !== 'NEW' && state.state !== 'SUSPENDED' && (!preferred || preferred.has(state.key)))
    eligible.sort((a, b) => {
      const due = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
      return due || (catalogOrder.get(a.entryId) ?? Number.MAX_SAFE_INTEGER) - (catalogOrder.get(b.entryId) ?? Number.MAX_SAFE_INTEGER)
    })
    const session = preferred ? eligible : eligible.slice(0, 20)
    if (!session.length) {
      setNotice(intl.formatMessage({ id: 'noStudiedCards' }))
      setScreen('home')
      return
    }
    openSession(session, 'free')
  }

  async function startExploration() {
    const now = new Date()
    const [all, reviews] = await Promise.all([
      db.schedules.where('direction').equals(settings.direction).toArray(),
      db.reviews.filter((item) => item.direction === settings.direction).toArray()
    ])
    const active = statesForSelection(all, pathSummary.selectedNewEntries, catalogEntryIds, pathPreferences.reviewScope)
    const activeReviews = reviewsForSelection(reviews, pathSummary.selectedNewEntries, catalogEntryIds, pathPreferences.reviewScope)
    const summary = summarizeProgress(active, activeReviews, now)
    const remainingNew = remainingDailyNew(reviews, settings.direction, now, settings.dailyNew)
    const planned = summary.dueCount + Math.min(summary.newCount, remainingNew)
    if (!hasActiveReviewToday(activeReviews, settings.direction, reviewEntryIds, now) || planned > 0) {
      setNotice(intl.formatMessage({ id: 'explorationLocked' }))
      setScreen('home')
      return
    }
    const session = randomExplorationSession(active, 10)
    if (!session.length) {
      setNotice(intl.formatMessage({ id: 'explorationEmpty' }))
      setScreen('home')
      return
    }
    openSession(session, 'exploration')
  }

  function finishOrAdvance(rest: ScheduleState[], rating: Rating) {
    setQueue(rest); setAnswer(''); setRevealed(false); setUnknownAnswer(false); setNotice('')
    if (!rest.length) {
      completionFeedback(settings)
      setScreen('complete')
      return
    }
    playSound(ratingSound[rating], settings.soundMode)
  }

  function advanceUnscheduled(rating: Rating) {
    finishOrAdvance(queue.slice(1), rating)
  }

  async function rate(rating: Rating) {
    if (!current) return
    if (sessionMode !== 'scheduled') {
      advanceUnscheduled(rating)
      return
    }
    const now = new Date()
    const next = reviewSchedule(current, rating, now)
    const event: ReviewEvent = {
      id: crypto.randomUUID(), scheduleKey: current.key, entryId: current.entryId, direction: current.direction, rating,
      reviewedAt: now.toISOString(), previousDueAt: current.dueAt, nextDueAt: next.dueAt,
      appVersion, catalogVersion, schedulerVersion: 'srs-1', previousState: current
    }
    try {
      await db.transaction('rw', db.schedules, db.reviews, async () => {
        await db.schedules.put(next)
        await db.reviews.add(event)
      })
    } catch {
      setNotice(intl.formatMessage({ id: 'saveReviewError' }))
      return
    }
    setLastReview(event)
    finishOrAdvance(queue.slice(1), rating)
  }

  function revealAnswer() {
    playSound('cardFlip', settings.soundMode)
    setRevealed(true)
  }

  function revealUnknown() {
    playSound('cardFlip', settings.soundMode)
    setAnswer('')
    setUnknownAnswer(true)
    setRevealed(true)
  }

  async function undoLastReview() {
    if (!lastReview || lastReview.canceledAt) return
    const canceledAt = new Date().toISOString()
    await db.transaction('rw', db.schedules, db.reviews, async () => {
      await db.schedules.put(lastReview.previousState)
      await db.reviews.update(lastReview.id, { canceledAt })
    })
    setQueue((items) => [lastReview.previousState, ...items.filter((item) => item.key !== lastReview.previousState.key)])
    setLastReview(null); setAnswer(''); setRevealed(false); setUnknownAnswer(false); setNotice(''); setSessionMode('scheduled'); setScreen('session')
  }

  async function downloadExport() {
    const blob = new Blob([await exportProgress()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `reversolinguo-${new Date().toISOString().slice(0, 10)}.json`; link.click()
    URL.revokeObjectURL(url); setNotice(intl.formatMessage({ id: 'exportDone' }))
  }

  async function uploadImport(file?: File) {
    if (!file) return
    try { await importProgress(await file.text()); setNotice(intl.formatMessage({ id: 'importDone' })); setTimeout(() => location.reload(), 400) }
    catch (error) { setNotice(error instanceof Error ? error.message : intl.formatMessage({ id: 'importFailed' })) }
  }

  async function erase() {
    if (!confirm(intl.formatMessage({ id: 'eraseConfirm' }))) return
    await resetProgress(); setSettings(defaultSettings); setScreen('onboarding')
  }

  if (screen === 'loading') return <main className="shell"><p aria-live="polite"><FormattedMessage id="loading" /></p></main>

  if (screen === 'onboarding') return (
    <main className="shell onboarding">
      <div className="brand-mark" aria-hidden="true">R</div><h1><FormattedMessage id="title" /></h1><p className="tagline"><FormattedMessage id="tagline" /></p>
      <section className="panel" aria-labelledby="direction-title">
        <h2 id="direction-title"><FormattedMessage id="direction" /></h2>
        <label htmlFor="daily-goal"><FormattedMessage id="dailyGoal" /></label>
        <input id="daily-goal" type="number" min="1" max="60" value={settings.dailyGoalMinutes} onChange={(event) => setSettings((value) => ({ ...value, dailyGoalMinutes: Math.max(1, Math.min(60, Number(event.target.value) || 10)) }))} />
        <span className="helper"><FormattedMessage id="dailyGoalHelper" /></span>
        {activeLanguagePair.directions.map((config, index) => <button key={config.id} className={index === 0 ? 'primary' : 'secondary'} onClick={() => begin(config.id)}><FormattedMessage id={config.selectMessageId} /></button>)}
      </section><p className="privacy"><FormattedMessage id="privacy" /></p>
    </main>
  )

  if (screen === 'paths') return <PathSelector initial={pathPreferences} onSave={savePath} onBack={() => setScreen('home')} banner={updateBanner} />

  if (screen === 'home') {
    const planned = progress.dueCount + Math.min(progress.newCount, newRemainingToday)
    const hasSession = planned > 0
    const estimate = hasSession ? Math.max(1, Math.ceil(planned * 0.5)) : 0
    const challengeInfo = challenge(progress, settings.dailyNew, newRemainingToday, freeReviewAvailable)
    return (
      <main className="shell">{updateBanner}
        <header className="topbar"><div><span className="eyebrow">{activeLanguagePair.targetLanguage.toUpperCase()} · {activeLanguagePair.sourceLanguage.toUpperCase()} · {pathSummary.cefrTargets.join(' + ') || '—'}</span><h1><FormattedMessage id="title" /></h1></div><button className="icon-button" onClick={() => setScreen('settings')} aria-label={intl.formatMessage({ id: 'settings' })}>⚙︎</button></header>
        <section className="panel path-current"><span className="eyebrow"><FormattedMessage id="pathCurrent" /></span><h2>{labelForPath(pathSummary)}</h2><p className="helper">{pathSummary.frameworks.join(' + ')} · {pathSummary.frameworkVersions.join(' + ')}</p><p><FormattedMessage id="pathSelectedNewCount" values={{ count: pathSummary.selectedNewCount }} /></p><p className="helper"><FormattedMessage id={pathPreferences.reviewScope === 'selection-only' ? 'pathReviewSelectionOnly' : 'pathReviewAllDue'} /></p><button className="secondary" onClick={() => setScreen('paths')}><FormattedMessage id="pathOpen" /></button></section>
        <section className="hero-card"><span className="status"><span aria-hidden="true">●</span> <FormattedMessage id={offlineReady ? 'offlineReady' : 'preparingOffline'} /></span><h2><FormattedMessage id="tagline" /></h2>
          <p><FormattedMessage id="due" values={{ count: progress.dueCount }} /> · {hasSession ? <FormattedMessage id="sessionEstimate" values={{ minutes: estimate }} /> : <FormattedMessage id="noScheduledSession" />}</p>
          {progress.dueCount > 0 && <button className="primary large" onClick={startSession}><FormattedMessage id="reviewNow" /></button>}
          {progress.dueCount === 0 && progress.newCount > 0 && newRemainingToday > 0 && <button className="primary large" onClick={startSession}><FormattedMessage id="discoverNow" /></button>}
          {progress.dueCount === 0 && freeReviewAvailable && <button className="secondary" onClick={() => startFreeReview()}><FormattedMessage id="freeReview" /></button>}
          {dailySessionCompleted && <button className="secondary" onClick={startExploration}><FormattedMessage id="explorationOpen" /></button>}
          {progress.dueCount === 0 && progress.newCount > 0 && settings.dailyNew === 0 && <button className="secondary" onClick={() => setScreen('settings')}><FormattedMessage id="editNewQuota" /></button>}
          {progress.dueCount === 0 && progress.newCount > 0 && settings.dailyNew > 0 && newRemainingToday === 0 && <p className="helper"><FormattedMessage id={freeReviewAvailable ? 'quotaReachedFree' : 'quotaReached'} /></p>}
          {progress.dueCount === 0 && progress.newCount === 0 && <p className="helper"><FormattedMessage id={freeReviewAvailable ? 'nothingDueFree' : 'nothingDue'} /></p>}
          {notice && <p className="notice" role="status">{notice}</p>}
        </section>
        <section className="stats" aria-label={intl.formatMessage({ id: 'statsLabel' })}>
          <div><strong>{progress.newCount}</strong><span><FormattedMessage id="statNew" /></span></div><div><strong>{progress.learningCount}</strong><span><FormattedMessage id="statLearning" /></span></div>
          <div><strong>{progress.consolidatedCount}</strong><span><FormattedMessage id="statConsolidated" /></span></div><div><strong>{progress.coveragePercent} %</strong><span><FormattedMessage id="statCoverage" /></span></div>
          <div><strong>{progress.recallRate30d === null ? '—' : `${progress.recallRate30d} %`}</strong><span><FormattedMessage id="statRecall" /></span></div><div><strong>{progress.effortPoints}</strong><span><FormattedMessage id="statEffort" /></span></div>
        </section>
        <button className="secondary" onClick={() => setScreen('vocabulary')}><FormattedMessage id="vocabularyOpen" /></button>
        <section className="panel motivation"><h2><FormattedMessage id="today" /></h2><p><FormattedMessage id={challengeInfo.id} values={challengeInfo.values} /></p><p><FormattedMessage id="activeDays" values={{ count: progress.activeDays7 }} /> · <FormattedMessage id="noStreakLoss" /></p>{progress.consolidatedCount > 0 && <p className="badge"><FormattedMessage id="firstConsolidatedBadge" /></p>}</section>
        <p className="privacy"><FormattedMessage id="privacy" /></p>
      </main>
    )
  }

  if (screen === 'vocabulary') return <VocabularyBrowser entries={catalog} initialDirection={settings.direction} onBack={() => setScreen('home')} banner={updateBanner} />

  if (screen === 'settings') return (
    <main className="shell">{updateBanner}<header className="topbar"><button className="back" onClick={() => setScreen('home')}>← <FormattedMessage id="back" /></button><h1><FormattedMessage id="settings" /></h1></header>
      <section className="panel actions">
        <button className="secondary" onClick={() => setScreen('paths')}><FormattedMessage id="pathOpen" /></button>
        <label htmlFor="direction"><FormattedMessage id="direction" /></label><select id="direction" value={settings.direction} onChange={(event) => void persistSettings({ direction: event.target.value })}>{activeLanguagePair.directions.map((config) => <option key={config.id} value={config.id}>{intl.formatMessage({ id: config.displayMessageId })}</option>)}</select>
        <label htmlFor="daily-new"><FormattedMessage id="dailyNew" values={{ count: settings.dailyNew }} /></label><input id="daily-new" type="number" min="0" max="20" value={settings.dailyNew} onChange={(event) => void persistSettings({ dailyNew: Math.max(0, Math.min(20, Number(event.target.value) || 0)) })} />
        <label htmlFor="daily-goal-settings"><FormattedMessage id="dailyGoalSettings" /></label><input id="daily-goal-settings" type="number" min="1" max="60" value={settings.dailyGoalMinutes} onChange={(event) => void persistSettings({ dailyGoalMinutes: Math.max(1, Math.min(60, Number(event.target.value) || 10)) })} />
        <label className="check"><input type="checkbox" checked={settings.motionEnabled} onChange={(event) => void persistSettings({ motionEnabled: event.target.checked })} /> <FormattedMessage id="motionSetting" /></label>
        <label htmlFor="sound-mode"><FormattedMessage id="soundSetting" /></label><select id="sound-mode" value={settings.soundMode} onChange={(event) => { if (isSoundMode(event.target.value)) void persistSettings({ soundMode: event.target.value }) }}><option value="off"><FormattedMessage id="soundModeOff" /></option><option value="subtle"><FormattedMessage id="soundModeSubtle" /></option><option value="on"><FormattedMessage id="soundModeOn" /></option></select>
        <span className="helper"><FormattedMessage id="soundModeHelper" /></span>
        <label className="check"><input type="checkbox" checked={settings.vibrationEnabled} onChange={(event) => void persistSettings({ vibrationEnabled: event.target.checked })} /> <FormattedMessage id="vibrationSetting" /></label>
        <button className="secondary" onClick={downloadExport}><FormattedMessage id="export" /></button><label className="file-button"><FormattedMessage id="import" /><input type="file" accept="application/json" onChange={(event) => uploadImport(event.target.files?.[0])} /></label><button className="danger" onClick={erase}><FormattedMessage id="reset" /></button>
        <p><FormattedMessage id="storage" values={{ size: storageSize ?? intl.formatMessage({ id: 'storageUnavailable' }) }} /></p><p className="notice" aria-live="polite">{notice}</p>
      </section><PrivacyNotice /><p className="privacy"><FormattedMessage id="eraseBrowserWarning" /></p>
    </main>
  )

  if (screen === 'complete') {
    const completeTitle = sessionMode === 'scheduled' ? 'finish' : sessionMode === 'free' ? 'freeFinish' : 'explorationFinish'
    const completeDetail = sessionMode === 'scheduled' ? 'finishDetail' : sessionMode === 'free' ? 'freeFinishDetail' : 'explorationFinishDetail'
    return <main className="shell centered">{updateBanner}<div className={`success${settings.motionEnabled ? ' pulse' : ''}`} aria-hidden="true">✓</div><h1><FormattedMessage id={completeTitle} /></h1><p><FormattedMessage id={completeDetail} /></p>{sessionMode === 'scheduled' && lastReview && <button className="secondary" onClick={undoLastReview}><FormattedMessage id="undo" /></button>}{sessionMode !== 'exploration' && completedSessionKeys.length > 0 && <button className="secondary" onClick={() => startFreeReview(completedSessionKeys)}><FormattedMessage id="replayFree" /></button>}<button className="primary" onClick={() => setScreen('home')}><FormattedMessage id="home" /></button></main>
  }

  const modePrefix = sessionMode === 'free' ? `${intl.formatMessage({ id: 'freeReviewLabel' })} · ` : sessionMode === 'exploration' ? `${intl.formatMessage({ id: 'explorationLabel' })} · ` : ''
  const differenceMessage: MessageId = comparison.difference === 'accent' ? 'differenceAccent' : comparison.difference === 'article-or-gender' ? 'differenceArticleGender' : 'differenceSpelling'
  return (
    <main className="shell session"><header className="session-header"><button className="back" onClick={() => setScreen('home')}>× <span className="sr-only"><FormattedMessage id="closeSession" /></span></button><progress value={Math.max(1, sessionTotal - queue.length + 1)} max={Math.max(1, sessionTotal)} aria-label={intl.formatMessage({ id: 'sessionProgress' })}/><span>{queue.length}</span></header>
      {lastReview && sessionMode === 'scheduled' && <button className="undo-banner" onClick={undoLastReview}><FormattedMessage id="undo" /></button>}
      {notice && <p className="notice" role="alert">{notice}</p>}
      {entry && current && directionConfig && examples && <section className="flashcard" aria-live="polite"><span className="direction-label">{modePrefix}<FormattedMessage id={directionConfig.promptMessageId} /></span><h1 lang={directionConfig.promptLanguage} dir="auto">{prompt}</h1><label htmlFor="answer"><FormattedMessage id="answerLabel" /></label><input id="answer" value={answer} onChange={(event) => setAnswer(event.target.value)} autoComplete="off" autoCapitalize="none" disabled={revealed} lang={directionConfig.answerLanguage} />
        {!revealed ? <><button className="primary" onClick={revealAnswer} disabled={!answer.trim()}><FormattedMessage id="showAnswer" /></button><button className="secondary" onClick={revealUnknown}><FormattedMessage id="unknown" /></button></> : <div className="correction"><p className={unknownAnswer ? 'answer-review' : answerMatches ? 'answer-ok' : 'answer-review'}>{unknownAnswer ? <FormattedMessage id="unknownCorrection" /> : answerMatches ? <FormattedMessage id="answerExact" /> : <FormattedMessage id="answerCompare" />}</p>{!unknownAnswer && !answerMatches && <div className="answer-difference"><p><FormattedMessage id="answerGiven" values={{ answer }} /></p><p><strong><FormattedMessage id={differenceMessage} /></strong></p><p><FormattedMessage id="answerExpected" values={{ expected: comparison.expected }} /></p></div>}<h2 lang={directionConfig.answerLanguage} dir="auto">{comparison.expected || expected[0]}</h2><p><span lang={directionConfig.promptLanguage} dir="auto">{examples.prompt}</span><br/><span lang={directionConfig.answerLanguage} dir="auto">{examples.answer}</span></p>{unknownAnswer && sessionMode === 'scheduled' && <p className="helper"><FormattedMessage id="unknownScheduled" /></p>}{sessionMode === 'free' && <p className="helper"><FormattedMessage id="freeFinishDetail" /></p>}{sessionMode === 'exploration' && <p className="helper"><FormattedMessage id="explorationHelper" /></p>}{unknownAnswer ? <button className="primary" onClick={() => rate(0)}><FormattedMessage id="continue" /></button> : <fieldset><legend><FormattedMessage id="recallRating" /></legend><div className="rating-grid"><button onClick={() => rate(0)}><FormattedMessage id="forgot" /></button><button onClick={() => rate(1)}><FormattedMessage id="hard" /></button><button onClick={() => rate(2)}><FormattedMessage id="correct" /></button><button onClick={() => rate(3)}><FormattedMessage id="easy" /></button></div></fieldset>}</div>}
      </section>}
    </main>
  )
}

export default function App() { return <IntlProvider locale="fr" messages={messages}><AppContent /></IntlProvider> }
