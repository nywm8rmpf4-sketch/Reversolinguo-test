import { useEffect, useMemo, useState } from 'react'
import { FormattedMessage, IntlProvider, useIntl } from 'react-intl'
import { ensureCatalogSchedules } from './bootstrap'
import { PrivacyNotice } from './PrivacyNotice'
import { VocabularyBrowser } from './VocabularyBrowser'
import { catalog, catalogVersion } from '../content/catalog'
import { appVersion } from '../config/version'
import { summarizeProgress, type ProgressSummary } from '../domain/progress'
import { orderSession, remainingDailyNew, reviewSchedule } from '../domain/scheduler'
import type { Direction, Rating, ReviewEvent, ScheduleState } from '../domain/model'
import { db, defaultSettings, exportProgress, importProgress, resetProgress, type SettingsRecord } from '../storage/database'
import { messages } from '../i18n/messages'
import { applyServiceWorkerUpdate } from '../pwa/update'
import '../ui/styles.css'

type Screen = 'loading' | 'onboarding' | 'home' | 'session' | 'settings' | 'vocabulary' | 'complete'
type SessionMode = 'scheduled' | 'free'

const emptyProgress: ProgressSummary = { total: 0, newCount: 0, dueCount: 0, learningCount: 0, consolidatedCount: 0, coveragePercent: 0, recallRate30d: null, effortPoints: 0, activeDays7: 0 }
const catalogThemes = new Map(catalog.map((item) => [item.id, item.theme]))
const catalogEntryIds = new Set(catalog.map((item) => item.id))

function normalize(value: string) {
  return value.normalize('NFC').trim().toLocaleLowerCase('fr').replace(/[.!?]$/u, '')
}

function challenge(summary: ProgressSummary, configuredDailyNew: number, remainingNew: number, freeReviewAvailable: boolean) {
  if (summary.dueCount > 0) return `Défi léger : réviser ${Math.min(3, summary.dueCount)} carte${summary.dueCount > 1 ? 's' : ''} à revoir.`
  if (summary.newCount > 0 && remainingNew > 0) return `Défi léger : découvrir ${Math.min(2, summary.newCount, remainingNew)} nouveau${Math.min(summary.newCount, remainingNew) > 1 ? 'x' : ''} mot${Math.min(summary.newCount, remainingNew) > 1 ? 's' : ''}.`
  if (summary.newCount > 0 && configuredDailyNew === 0) return freeReviewAvailable ? 'Les nouveaux mots sont en pause ; vous pouvez réviser librement les cartes déjà vues.' : 'Les nouveaux mots sont en pause dans vos réglages.'
  if (summary.newCount > 0) return freeReviewAvailable ? 'Quota de nouveaux mots atteint ; une révision libre reste disponible.' : 'Quota de nouveaux mots atteint pour aujourd’hui. Vous pourrez reprendre demain.'
  if (freeReviewAvailable) return 'Défi léger : rejouer quelques cartes en révision libre.'
  return 'Rien à faire pour l’instant : revenez à la prochaine échéance.'
}

function successFeedback(settings: SettingsRecord) {
  if (settings.vibrationEnabled && 'vibrate' in navigator) navigator.vibrate(35)
  if (settings.soundEnabled && 'AudioContext' in window) {
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = 523
    gain.gain.value = 0.035
    oscillator.connect(gain); gain.connect(context.destination)
    oscillator.start(); oscillator.stop(context.currentTime + 0.08)
    oscillator.addEventListener('ended', () => void context.close())
  }
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
  const [notice, setNotice] = useState('')
  const [lastReview, setLastReview] = useState<ReviewEvent | null>(null)
  const [offlineReady, setOfflineReady] = useState(false)
  const [progress, setProgress] = useState<ProgressSummary>(emptyProgress)
  const [newRemainingToday, setNewRemainingToday] = useState(defaultSettings.dailyNew)
  const [freeReviewAvailable, setFreeReviewAvailable] = useState(false)
  const [storageSize, setStorageSize] = useState('indisponible')
  const [updateReady, setUpdateReady] = useState(false)

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
      const activeStates = states.filter((state) => catalogEntryIds.has(state.entryId))
      setProgress(summarizeProgress(activeStates, reviews, now))
      setNewRemainingToday(remainingDailyNew(reviews, settings.direction, now, settings.dailyNew))
      setFreeReviewAvailable(activeStates.some((state) => state.state !== 'NEW' && state.state !== 'SUSPENDED'))
    })
  }, [screen, settings.direction, settings.dailyNew])

  useEffect(() => {
    if (screen !== 'settings' || !navigator.storage?.estimate) return
    navigator.storage.estimate().then(({ usage }) => setStorageSize(`${Math.ceil((usage ?? 0) / 1024)} ko`)).catch(() => setStorageSize('indisponible'))
  }, [screen])

  const updateBanner = updateReady && screen !== 'session' ? <aside className="update-banner"><span>Une mise à jour est prête.</span><button onClick={() => applyServiceWorkerUpdate()}>Mettre à jour</button></aside> : null
  const current = queue[0]
  const entry = useMemo(() => catalog.find((item) => item.id === current?.entryId), [current])
  const expected = entry ? (current?.direction === 'fr-es' ? entry.es.split(',').map((item) => item.trim()) : entry.fr) : []
  const prompt = entry ? (current?.direction === 'fr-es' ? entry.fr[0] : entry.es) : ''
  const answerMatches = expected.some((item) => normalize(item) === normalize(answer))

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

  function openSession(session: ScheduleState[], mode: SessionMode) {
    setSessionMode(mode)
    setCompletedSessionKeys(session.map((state) => state.key))
    setLastReview(null)
    setNotice('')
    setQueue(session)
    setSessionTotal(session.length)
    setAnswer('')
    setRevealed(false)
    setScreen('session')
  }

  async function startSession() {
    const now = new Date()
    const [all, reviews] = await Promise.all([
      db.schedules.where('direction').equals(settings.direction).toArray(),
      db.reviews.filter((item) => item.direction === settings.direction).toArray()
    ])
    const catalogOrder = new Map(catalog.map((item, index) => [item.id, index]))
    const active = all.filter((state) => catalogEntryIds.has(state.entryId))
    active.sort((a, b) => (catalogOrder.get(a.entryId) ?? Number.MAX_SAFE_INTEGER) - (catalogOrder.get(b.entryId) ?? Number.MAX_SAFE_INTEGER))
    const remainingNew = remainingDailyNew(reviews, settings.direction, now, settings.dailyNew)
    const session = orderSession(active, now, remainingNew, catalogThemes)
    if (!session.length) {
      setNotice('Aucune carte à réviser ou découvrir pour le moment.')
      setScreen('home')
      return
    }
    openSession(session, 'scheduled')
  }

  async function startFreeReview(preferredKeys?: string[]) {
    const all = await db.schedules.where('direction').equals(settings.direction).toArray()
    const preferred = preferredKeys ? new Set(preferredKeys) : null
    const catalogOrder = new Map(catalog.map((item, index) => [item.id, index]))
    const eligible = all.filter((state) => catalogEntryIds.has(state.entryId) && state.state !== 'NEW' && state.state !== 'SUSPENDED' && (!preferred || preferred.has(state.key)))
    eligible.sort((a, b) => {
      const due = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
      return due || (catalogOrder.get(a.entryId) ?? Number.MAX_SAFE_INTEGER) - (catalogOrder.get(b.entryId) ?? Number.MAX_SAFE_INTEGER)
    })
    const session = preferred ? eligible : eligible.slice(0, 20)
    if (!session.length) {
      setNotice('Aucune carte déjà étudiée n’est disponible pour une révision libre.')
      setScreen('home')
      return
    }
    openSession(session, 'free')
  }

  function advanceFreeReview() {
    const rest = queue.slice(1)
    setQueue(rest); setAnswer(''); setRevealed(false); setNotice('')
    if (!rest.length) { successFeedback(settings); setScreen('complete') }
  }

  async function rate(rating: Rating) {
    if (!current) return
    if (sessionMode === 'free') {
      advanceFreeReview()
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
      setNotice('Impossible d’enregistrer ce rappel. La carte reste ici. Vérifiez l’espace disponible puis réessayez.')
      return
    }
    setLastReview(event); setNotice('')
    const rest = queue.slice(1)
    setQueue(rest); setAnswer(''); setRevealed(false)
    if (!rest.length) { successFeedback(settings); setScreen('complete') }
  }

  async function undoLastReview() {
    if (!lastReview || lastReview.canceledAt) return
    const canceledAt = new Date().toISOString()
    await db.transaction('rw', db.schedules, db.reviews, async () => {
      await db.schedules.put(lastReview.previousState)
      await db.reviews.update(lastReview.id, { canceledAt })
    })
    setQueue((items) => [lastReview.previousState, ...items.filter((item) => item.key !== lastReview.previousState.key)])
    setLastReview(null); setAnswer(''); setRevealed(false); setNotice(''); setSessionMode('scheduled'); setScreen('session')
  }

  async function downloadExport() {
    const blob = new Blob([await exportProgress()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `reversolinguo-${new Date().toISOString().slice(0, 10)}.json`; link.click()
    URL.revokeObjectURL(url); setNotice('Sauvegarde exportée.')
  }

  async function uploadImport(file?: File) {
    if (!file) return
    try { await importProgress(await file.text()); setNotice('Sauvegarde importée.'); setTimeout(() => location.reload(), 400) }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Import impossible.') }
  }

  async function erase() {
    if (!confirm('Effacer définitivement toute la progression sur cet appareil ?')) return
    await resetProgress(); setSettings(defaultSettings); setScreen('onboarding')
  }

  if (screen === 'loading') return <main className="shell"><p aria-live="polite">Chargement…</p></main>

  if (screen === 'onboarding') return (
    <main className="shell onboarding">
      <div className="brand-mark" aria-hidden="true">R</div><h1><FormattedMessage id="title" /></h1><p className="tagline"><FormattedMessage id="tagline" /></p>
      <section className="panel" aria-labelledby="direction-title">
        <h2 id="direction-title"><FormattedMessage id="direction" /></h2>
        <label htmlFor="daily-goal">Objectif quotidien indicatif</label>
        <input id="daily-goal" type="number" min="1" max="60" value={settings.dailyGoalMinutes} onChange={(event) => setSettings((value) => ({ ...value, dailyGoalMinutes: Math.max(1, Math.min(60, Number(event.target.value) || 10)) }))} />
        <span className="helper">Minutes souhaitées ; vous pouvez arrêter à tout moment.</span>
        <button className="primary" onClick={() => begin('fr-es')}><FormattedMessage id="frEs" /></button>
        <button className="secondary" onClick={() => begin('es-fr')}><FormattedMessage id="esFr" /></button>
      </section><p className="privacy"><FormattedMessage id="privacy" /></p>
    </main>
  )

  if (screen === 'home') {
    const planned = progress.dueCount + Math.min(progress.newCount, newRemainingToday)
    const hasSession = planned > 0
    const estimate = hasSession ? Math.max(1, Math.ceil(planned * 0.5)) : 0
    return (
      <main className="shell">{updateBanner}
        <header className="topbar"><div><span className="eyebrow">FR · ES · A1</span><h1><FormattedMessage id="title" /></h1></div><button className="icon-button" onClick={() => setScreen('settings')} aria-label={intl.formatMessage({ id: 'settings' })}>⚙︎</button></header>
        <section className="hero-card"><span className="status"><span aria-hidden="true">●</span> <FormattedMessage id={offlineReady ? 'offlineReady' : 'preparingOffline'} /></span><h2><FormattedMessage id="tagline" /></h2>
          <p><FormattedMessage id="due" values={{ count: progress.dueCount }} />{hasSession ? ` · environ ${estimate} min (estimation)` : ' · aucune séance planifiée'}</p>
          {progress.dueCount > 0 && <button className="primary large" onClick={startSession}><FormattedMessage id="reviewNow" /></button>}
          {progress.dueCount === 0 && progress.newCount > 0 && newRemainingToday > 0 && <button className="primary large" onClick={startSession}>Découvrir maintenant</button>}
          {progress.dueCount === 0 && freeReviewAvailable && <button className="secondary" onClick={() => startFreeReview()}>Réviser librement</button>}
          {progress.dueCount === 0 && progress.newCount > 0 && settings.dailyNew === 0 && <button className="secondary" onClick={() => setScreen('settings')}>Modifier le quota de nouveaux mots</button>}
          {progress.dueCount === 0 && progress.newCount > 0 && settings.dailyNew > 0 && newRemainingToday === 0 && <p className="helper">{freeReviewAvailable ? 'Quota de nouveaux mots atteint pour aujourd’hui. Vous pouvez réviser librement les cartes déjà vues ou revenir demain.' : 'Quota de nouveaux mots atteint pour aujourd’hui. Revenez demain ou attendez les prochaines révisions.'}</p>}
          {progress.dueCount === 0 && progress.newCount === 0 && <p className="helper">Rien à réviser selon le planning pour le moment. {freeReviewAvailable ? 'Vous pouvez réviser librement ou revenir à la prochaine échéance.' : 'Revenez à la prochaine échéance.'}</p>}
          {notice && <p className="notice" role="status">{notice}</p>}
        </section>
        <section className="stats" aria-label="Progression">
          <div><strong>{progress.newCount}</strong><span>À découvrir</span></div><div><strong>{progress.learningCount}</strong><span>En apprentissage</span></div>
          <div><strong>{progress.consolidatedCount}</strong><span>Consolidées (intervalle ≥ 21 j)</span></div><div><strong>{progress.coveragePercent} %</strong><span>Catalogue A1 étudié</span></div>
          <div><strong>{progress.recallRate30d === null ? '—' : `${progress.recallRate30d} %`}</strong><span>Rappels corrects sur 30 j</span></div><div><strong>{progress.effortPoints}</strong><span>Points d’effort · 1 par rappel</span></div>
        </section>
        <button className="secondary" onClick={() => setScreen('vocabulary')}><FormattedMessage id="vocabularyOpen" /></button>
        <section className="panel motivation"><h2>Pour aujourd’hui</h2><p>{challenge(progress, settings.dailyNew, newRemainingToday, freeReviewAvailable)}</p><p>{progress.activeDays7} jour{progress.activeDays7 > 1 ? 's' : ''} actif{progress.activeDays7 > 1 ? 's' : ''} sur les 7 derniers · aucune série à perdre.</p>{progress.consolidatedCount > 0 && <p className="badge">Badge : premier rappel consolidé</p>}</section>
        <p className="privacy"><FormattedMessage id="privacy" /></p>
      </main>
    )
  }

  if (screen === 'vocabulary') return <VocabularyBrowser entries={catalog} initialDirection={settings.direction} onBack={() => setScreen('home')} banner={updateBanner} />

  if (screen === 'settings') return (
    <main className="shell">{updateBanner}<header className="topbar"><button className="back" onClick={() => setScreen('home')}>← <FormattedMessage id="back" /></button><h1><FormattedMessage id="settings" /></h1></header>
      <section className="panel actions">
        <label htmlFor="direction"><FormattedMessage id="direction" /></label><select id="direction" value={settings.direction} onChange={(event) => void persistSettings({ direction: event.target.value as Direction })}><option value="fr-es">Français → espagnol</option><option value="es-fr">Espagnol → français</option></select>
        <label htmlFor="daily-new">Nouveaux mots par jour : {settings.dailyNew}</label><input id="daily-new" type="number" min="0" max="20" value={settings.dailyNew} onChange={(event) => void persistSettings({ dailyNew: Math.max(0, Math.min(20, Number(event.target.value) || 0)) })} />
        <label htmlFor="daily-goal-settings">Objectif indicatif (minutes)</label><input id="daily-goal-settings" type="number" min="1" max="60" value={settings.dailyGoalMinutes} onChange={(event) => void persistSettings({ dailyGoalMinutes: Math.max(1, Math.min(60, Number(event.target.value) || 10)) })} />
        <label className="check"><input type="checkbox" checked={settings.motionEnabled} onChange={(event) => void persistSettings({ motionEnabled: event.target.checked })} /> Micro-animation de fin</label>
        <label className="check"><input type="checkbox" checked={settings.soundEnabled} onChange={(event) => void persistSettings({ soundEnabled: event.target.checked })} /> Son de réussite</label>
        <label className="check"><input type="checkbox" checked={settings.vibrationEnabled} onChange={(event) => void persistSettings({ vibrationEnabled: event.target.checked })} /> Vibration de réussite</label>
        <button className="secondary" onClick={downloadExport}><FormattedMessage id="export" /></button><label className="file-button"><FormattedMessage id="import" /><input type="file" accept="application/json" onChange={(event) => uploadImport(event.target.files?.[0])} /></label><button className="danger" onClick={erase}><FormattedMessage id="reset" /></button>
        <p><FormattedMessage id="storage" values={{ size: storageSize }} /></p><p className="notice" aria-live="polite">{notice}</p>
      </section><PrivacyNotice /><p className="privacy">L’effacement des données du navigateur peut supprimer votre progression. Exportez-la régulièrement.</p>
    </main>
  )

  if (screen === 'complete') return <main className="shell centered">{updateBanner}<div className={`success${settings.motionEnabled ? ' pulse' : ''}`} aria-hidden="true">✓</div><h1><FormattedMessage id="finish" /></h1><p><FormattedMessage id="finishDetail" /></p>{lastReview && <button className="secondary" onClick={undoLastReview}><FormattedMessage id="undo" /></button>}{completedSessionKeys.length > 0 && <button className="secondary" onClick={() => startFreeReview(completedSessionKeys)}>Rejouer librement</button>}<button className="primary" onClick={() => setScreen('home')}>Retour à l’accueil</button></main>

  return (
    <main className="shell session"><header className="session-header"><button className="back" onClick={() => setScreen('home')}>× <span className="sr-only">Fermer la séance</span></button><progress value={Math.max(1, sessionTotal - queue.length + 1)} max={Math.max(1, sessionTotal)} aria-label="Progression de la séance"/><span>{queue.length}</span></header>
      {lastReview && sessionMode === 'scheduled' && <button className="undo-banner" onClick={undoLastReview}><FormattedMessage id="undo" /></button>}
      {notice && <p className="notice" role="alert">{notice}</p>}
      {entry && current && <section className="flashcard" aria-live="polite"><span className="direction-label">{sessionMode === 'free' ? 'Révision libre · ' : ''}{current.direction === 'fr-es' ? 'Traduisez en espagnol' : 'Traduisez en français'}</span><h1>{prompt}</h1><label htmlFor="answer">Votre réponse</label><input id="answer" value={answer} onChange={(event) => setAnswer(event.target.value)} autoComplete="off" autoCapitalize="none" disabled={revealed} />
        {!revealed ? <button className="primary" onClick={() => setRevealed(true)} disabled={!answer.trim()}><FormattedMessage id="showAnswer" /></button> : <div className="correction"><p className={answerMatches ? 'answer-ok' : 'answer-review'}>{answerMatches ? 'Réponse identique ✓' : 'Comparez votre réponse'}</p><h2>{expected[0]}</h2><p>{entry.exampleEs}<br/><span>{entry.exampleFr}</span></p>{sessionMode === 'free' && <p className="helper">Révision libre : votre choix n’affecte ni les échéances ni les statistiques.</p>}<fieldset><legend>Comment s’est passé ce rappel ?</legend><div className="rating-grid"><button onClick={() => rate(0)}><FormattedMessage id="forgot" /></button><button onClick={() => rate(1)}><FormattedMessage id="hard" /></button><button onClick={() => rate(2)}><FormattedMessage id="correct" /></button><button onClick={() => rate(3)}><FormattedMessage id="easy" /></button></div></fieldset></div>}
      </section>}
    </main>
  )
}

export default function App() { return <IntlProvider locale="fr" messages={messages}><AppContent /></IntlProvider> }
