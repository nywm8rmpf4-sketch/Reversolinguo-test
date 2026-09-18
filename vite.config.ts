import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Release artifacts must be portable between the QA project subpath and
  // the publication repository root. Keep generated URLs relative.
  base: './',
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/pwa',
      filename: 'sw.ts',
      injectManifest: {
        // ADR-040: external runtime JSON remains a separate offline precache asset.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json}'],
        // ADR-039: bounded A2 transition. B1 must externalize catalog data instead
        // of increasing this 3 MiB ceiling.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024
      },
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Reversolinguo',
        short_name: 'Reversolinguo',
        description: 'Apprendre le vocabulaire espagnol par répétition espacée',
        lang: 'fr',
        start_url: './',
        display: 'standalone',
        background_color: '#fffaf2',
        theme_color: '#9f2d3f',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
      }
    })
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/e2e/**']
  }
})
