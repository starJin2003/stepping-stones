import '@fontsource/lexend/400.css'
import '@fontsource/lexend/700.css'
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import { initModel } from './ai/client.ts'
import { requestPersistentStorage } from './db/settings.ts'
import { LanguageProvider } from './i18n/language.tsx'

registerSW({ immediate: true })
requestPersistentStorage().catch(() => {})
// Opens the model if it is already on this phone. Never downloads.
initModel().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
)
