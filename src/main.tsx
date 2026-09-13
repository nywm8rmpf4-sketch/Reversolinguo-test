import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ensureCatalogSchedules } from './app/bootstrap'
import { configureServiceWorker } from './pwa/update'
import App from './app/App'

configureServiceWorker()

void ensureCatalogSchedules().finally(() => {
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
})
