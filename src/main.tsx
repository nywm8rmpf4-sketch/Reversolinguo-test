import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loadVerifiedRuntimeBundle } from './content/integrity'
import { messages } from './i18n/messages'
import { configureServiceWorker } from './pwa/update'

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
  const integrity = await loadVerifiedRuntimeBundle()
  if (!integrity.ok) {
    renderIntegrityError()
    return
  }

  configureServiceWorker()
  const [{ ensureCatalogSchedules }, { default: App }] = await Promise.all([
    import('./app/bootstrap'),
    import('./app/App')
  ])

  void ensureCatalogSchedules().finally(() => {
    createRoot(rootElement).render(<StrictMode><App /></StrictMode>)
  })
}

void start().catch(renderIntegrityError)
