import { describe, expect, it } from 'vitest'
import packageMetadata from '../../package.json'
import manifest from '../../catalogs/fr-es/a1/manifest.json'
import { appVersion } from '../../src/config/version'

describe('application version identity', () => {
  it('uses package.json as the runtime version source', () => {
    expect(appVersion).toBe(packageMetadata.version)
  })

  it('does not require a catalogue version newer than the current application', () => {
    expect(manifest.min_app_version).toBe(packageMetadata.version)
  })
})
