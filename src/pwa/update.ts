import { registerSW } from 'virtual:pwa-register'

let activateUpdate: (reloadPage?: boolean) => Promise<void> = async () => undefined
let registration: ServiceWorkerRegistration | undefined

const reloadFallbackMs = 2_500

export function configureServiceWorker() {
  activateUpdate = registerSW({
    immediate: false,
    onNeedRefresh() { window.dispatchEvent(new Event('reversolinguo:update-ready')) },
    onRegisteredSW(_scriptUrl, currentRegistration) { registration = currentRegistration }
  })
}

export async function applyServiceWorkerUpdate(
  reloadPage: () => void = () => window.location.reload(),
  fallbackMs = reloadFallbackMs
) {
  let controllerChangeHandler: (() => void) | undefined
  let fallbackTimer: number | undefined

  const controllerChanged = new Promise<void>((resolve) => {
    if (!('serviceWorker' in navigator)) {
      resolve()
      return
    }
    controllerChangeHandler = () => resolve()
    navigator.serviceWorker.addEventListener('controllerchange', controllerChangeHandler, { once: true })
  })
  const fallback = new Promise<void>((resolve) => {
    fallbackTimer = window.setTimeout(resolve, fallbackMs)
  })

  registration?.waiting?.postMessage({ type: 'SKIP_WAITING' })
  await activateUpdate()
  await Promise.race([controllerChanged, fallback])

  if (controllerChangeHandler && 'serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('controllerchange', controllerChangeHandler)
  if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer)
  reloadPage()
}
