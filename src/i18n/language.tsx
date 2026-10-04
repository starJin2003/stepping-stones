import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { setSetting, useSettings } from '../db/settings.ts'
import { DEFAULT_LANG, isLang, LANGUAGE_NAMES, STRINGS, translate, type Lang, type Translate } from './strings.ts'

interface LanguageValue {
  lang: Lang
  t: Translate
  setLang: (lang: Lang) => void
}

const LanguageContext = createContext<LanguageValue | null>(null)

const saveLanguage = (next: Lang) => void setSetting('ui_language', next)

/**
 * Reads the saved UI language and keeps <html lang> in step. Renders nothing until settings load, so the wrong
 * language never flashes. On the very first launch, with no language saved, it asks once and then continues.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const settings = useSettings()
  const lang: Lang = isLang(settings?.ui_language) ? settings.ui_language : DEFAULT_LANG

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  if (!settings) return null
  if (!isLang(settings.ui_language)) return <FirstLanguage />
  const value: LanguageValue = {
    lang,
    t: (key, params) => translate(lang, key, params),
    setLang: saveLanguage,
  }
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

/** One simple full-screen choice. The question is shown in both languages, since neither is chosen yet. */
function FirstLanguage() {
  const langs = Object.keys(LANGUAGE_NAMES) as Lang[]
  return (
    <main className="first-language">
      <img src="/favicon.svg" alt="" width="64" height="64" />
      <h1>
        {langs.map((code) => (
          <span key={code} lang={code}>
            {STRINGS[code].language_choose}
          </span>
        ))}
      </h1>
      <div className="first-language-choices">
        {langs.map((code) => (
          <button key={code} className="button button-primary button-main" type="button" lang={code} onClick={() => saveLanguage(code)}>
            {LANGUAGE_NAMES[code]}
          </button>
        ))}
      </div>
    </main>
  )
}

export function useLanguage(): LanguageValue {
  const value = useContext(LanguageContext)
  if (!value) throw new Error('useLanguage needs a LanguageProvider')
  return value
}
