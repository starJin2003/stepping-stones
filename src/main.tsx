import '@fontsource/lexend/400.css'
import '@fontsource/lexend/700.css'
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import { requestPersistentStorage } from './db/settings.ts'
import { LanguageProvider } from './i18n/language.tsx'

registerSW({ immediate: true })
// The answer is shown under This phone. A failure here only means it shows as not supported.
requestPersistentStorage().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
)
