import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loadVerifiedRuntimeBundle, loadVerifiedRuntimeBundleForPair } from './content/integrity'
import { messages } from './i18n/messages'
import { configureServiceWorker } from './pwa/update'
import { defaultLanguagePairId, getLanguagePairConfig } from './i18n/languagePairs'
import { assertGlobalEntryIdUniqueness, selectRuntimePair } from './content/runtimeState'
import { db } from './storage/database'

const rootElement = document.getElementById('root')!

function renderIntegrityError() {
  createRoot(rootElement).render(
    <StrictMode>
      <main>
        <h1>{messages.integrityErrorTitle}</h1>
        <p>{messages.integrityErrorBody}</p>
      </main>
    </StrictMode>
  )
}

async function start() {
  const saved = await db.settings.get('settings')
  const pairId = saved?.activePairId ?? defaultLanguagePairId
  try { getLanguagePairConfig(pairId) } catch { renderIntegrityError(); return }

  const baselineIntegrity = await loadVerifiedRuntimeBundle()
  if (!baselineIntegrity.ok) {
    renderIntegrityError()
    return
  }
  const integrity = pairId === defaultLanguagePairId ? baselineIntegrity : await loadVerifiedRuntimeBundleForPair(pairId)
  if (!integrity.ok) {
    renderIntegrityError()
    return
  }

  assertGlobalEntryIdUniqueness()
  selectRuntimePair(pairId)
  configureServiceWorker()
  const { default: App } = await import('./app/App')
  createRoot(rootElement).render(<StrictMode><App /></StrictMode>)
}

void start().catch(renderIntegrityError)
