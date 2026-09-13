import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ensureCatalogSchedules } from './app/bootstrap'
import { verifyBundledCatalogIntegrity } from './content/integrity'
import { messages } from './i18n/messages'
import { configureServiceWorker } from './pwa/update'
import App from './app/App'

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

void verifyBundledCatalogIntegrity().then((integrity) => {
  if (!integrity.ok) {
    renderIntegrityError()
    return
  }

  configureServiceWorker()
  void ensureCatalogSchedules().finally(() => {
    createRoot(rootElement).render(<StrictMode><App /></StrictMode>)
  })
}).catch(renderIntegrityError)
