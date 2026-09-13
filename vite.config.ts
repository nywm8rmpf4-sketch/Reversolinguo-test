import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/pwa',
      filename: 'sw.ts',
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
