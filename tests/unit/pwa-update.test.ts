import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const activateUpdate = vi.fn(async () => undefined)
  return { activateUpdate, registerSW: vi.fn(() => activateUpdate) }
})

vi.mock('virtual:pwa-register', () => ({ registerSW: mocks.registerSW }))

import { applyServiceWorkerUpdate, configureServiceWorker } from '../../src/pwa/update'

describe('PWA update activation', () => {
  let controllerChange: (() => void) | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    mocks.activateUpdate.mockClear()
    mocks.registerSW.mockClear()
    controllerChange = undefined
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        addEventListener: vi.fn((_event: string, handler: () => void) => { controllerChange = handler }),
        removeEventListener: vi.fn()
      }
    })
    configureServiceWorker()
  })

  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(navigator, 'serviceWorker')
  })

  it('reloads when the new service worker takes control', async () => {
    const reload = vi.fn()
    const update = applyServiceWorkerUpdate(reload, 2_500)
    await vi.waitFor(() => expect(mocks.activateUpdate).toHaveBeenCalledOnce())

    controllerChange?.()
    await update

    expect(reload).toHaveBeenCalledOnce()
  })

  it('forces a reload on the iPad-compatible timeout path', async () => {
    const reload = vi.fn()
    const update = applyServiceWorkerUpdate(reload, 2_500)
    await vi.waitFor(() => expect(mocks.activateUpdate).toHaveBeenCalledOnce())

    await vi.advanceTimersByTimeAsync(2_500)
    await update

    expect(reload).toHaveBeenCalledOnce()
  })
})
