import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ensureCatalogSchedules } from './app/bootstrap'
import { verifyBundledCatalogIntegrity } from './content/integrity'
import { configureServiceWorker } from './pwa/update'
import App from './app/App'

const rootElement = document.getElementById('root')!

function renderIntegrityError() {
  createRoot(rootElement).render(
    <StrictMode>
      <main>
        <h1>Catalogue indisponible</h1>
        <p>Le catalogue n’a pas pu être vérifié. Réinstallez ou mettez à jour l’application. Aucune progression n’a été modifiée.</p>
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
