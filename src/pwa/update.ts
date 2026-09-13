import { registerSW } from 'virtual:pwa-register'

let activateUpdate: (reloadPage?: boolean) => Promise<void> = async () => undefined

export function configureServiceWorker() {
  activateUpdate = registerSW({
    immediate: false,
    onNeedRefresh() { window.dispatchEvent(new Event('reversolinguo:update-ready')) }
  })
}

export async function applyServiceWorkerUpdate() {
  await activateUpdate(true)
}
