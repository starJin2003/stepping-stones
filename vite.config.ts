import { createReadStream, readFileSync, statSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// The onnxruntime wasm that Transformers.js uses in browsers, served from our own origin at a fixed,
// versioned path (a new onnxruntime version gets a new URL, so a cached old binary is never reused).
const ORT_WASM_FILE = 'ort-wasm-simd-threaded.asyncify.wasm'
const ORT_WASM_SOURCE = `node_modules/onnxruntime-web/dist/${ORT_WASM_FILE}`
const ORT_VERSION = JSON.parse(readFileSync('node_modules/onnxruntime-web/package.json', 'utf8')).version as string
const ORT_WASM_PATH = `/ort/${ORT_VERSION}/${ORT_WASM_FILE}`

/** Copies the wasm into the build at ORT_WASM_PATH and serves it in dev. Never precached. */
function ortWasm(): Plugin {
  return {
    name: 'ort-wasm',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== ORT_WASM_PATH) return next()
        res.setHeader('content-type', 'application/wasm')
        createReadStream(ORT_WASM_SOURCE).pipe(res)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: ORT_WASM_PATH.slice(1), source: readFileSync(ORT_WASM_SOURCE) })
    },
  }
}

/**
 * onnxruntime's bundle also points at its wasm with new URL(..., import.meta.url), which makes the worker build
 * emit a second 27 MB copy into assets/. That fallback only runs when wasmPaths is unset, and the worker always
 * sets it (and passes the bytes directly), so the copy is dropped.
 */
function dropBundledOrtWasm(): Plugin {
  return {
    name: 'drop-bundled-ort-wasm',
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (/^assets\/ort-wasm-.*\.wasm$/.test(fileName)) delete bundle[fileName]
      }
    },
  }
}

export default defineConfig({
  define: {
    __ORT_WASM__: JSON.stringify({ path: ORT_WASM_PATH, bytes: statSync(ORT_WASM_SOURCE).size }),
  },
  worker: {
    format: 'es',
    plugins: () => [dropBundledOrtWasm()],
  },
  plugins: [
    react(),
    ortWasm(),
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
        // The AI model, tokenizer and wasm are a separate, opt-in download; never part of the app shell.
        globIgnores: ['ort/**'],
        navigateFallbackDenylist: [/^\/api\//],
        // /api responses are never cached: sync must always talk to the server or fail visibly.
        // The onnxruntime wasm is cached the first time the model download fetches it.
        runtimeCaching: [
          {
            urlPattern: /\/ort\/[^/]+\/[^/]+\.wasm$/,
            handler: 'CacheFirst',
            options: { cacheName: 'ort-wasm', cacheableResponse: { statuses: [200] } },
          },
        ],
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
