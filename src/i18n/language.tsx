import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { setSetting, useSettings } from '../db/settings.ts'
import { DEFAULT_LANG, isLang, translate, type Lang, type Translate } from './strings.ts'

interface LanguageValue {
  lang: Lang
  t: Translate
  setLang: (lang: Lang) => void
}

const LanguageContext = createContext<LanguageValue | null>(null)

/** Reads the saved UI language (Kiswahili unless changed) and keeps <html lang> in step. Renders nothing until settings load, so the wrong language never flashes. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const settings = useSettings()
  const lang: Lang = isLang(settings?.ui_language) ? settings.ui_language : DEFAULT_LANG

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  if (!settings) return null
  const value: LanguageValue = {
    lang,
    t: (key, params) => translate(lang, key, params),
    setLang: (next) => void setSetting('ui_language', next),
  }
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageValue {
  const value = useContext(LanguageContext)
  if (!value) throw new Error('useLanguage needs a LanguageProvider')
  return value
}
