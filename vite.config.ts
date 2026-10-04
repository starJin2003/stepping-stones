import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered in src/main.tsx.
      injectRegister: false,
      // The globPatterns below already precache the icons; listing them twice is noise.
      includeManifestIcons: false,
      manifest: {
        name: 'Stepping Stones',
        short_name: 'Stepping Stones',
        description: 'Connects what each visitor heard with what earlier visitors said they would pass on.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F3F6F4',
        theme_color: '#183D2B',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // Everything the app and its fonts need to start with no signal after the first visit.
        globPatterns: ['**/*.{js,css,html,svg,woff2,json,png}'],
        navigateFallbackDenylist: [/^\/api\//],
        // /api responses are never cached: sync must always talk to the server or fail visibly.
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    proxy: {
      '/api': { target: 'https://stepping-stones-plum.vercel.app', changeOrigin: true },
    },
  },
})
