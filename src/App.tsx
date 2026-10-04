import { useEffect, useState } from 'react'
import { useAutoAnalysis } from './ai/analysing.ts'
import { sendOutboxNow } from './db/outbox.ts'
import { useLanguage } from './i18n/language.tsx'
import type { StringKey } from './i18n/strings.ts'
import { operator } from './operator/active.ts'
import { MessagesScreen } from './screens/MessagesScreen.tsx'
import { StonesScreen } from './screens/StonesScreen.tsx'
import { SummaryScreen } from './screens/SummaryScreen.tsx'
import { SetupScreen } from './screens/SetupScreen.tsx'

const VIEWS = ['messages', 'stones', 'summary', 'setup'] as const
type View = (typeof VIEWS)[number]

function viewFromHash(): View {
  const hash = window.location.hash.slice(1)
  // #this-phone was the old name for Setup.
  if (hash === 'this-phone') return 'setup'
  return (VIEWS as readonly string[]).includes(hash) ? (hash as View) : 'messages'
}

const TABS: { view: View; label: StringKey }[] = [
  { view: 'messages', label: 'nav_messages' },
  { view: 'stones', label: 'nav_stones' },
  { view: 'summary', label: 'nav_summary' },
]

function App() {
  const { t } = useLanguage()
  const [view, setView] = useState<View>(viewFromHash)
  useAutoAnalysis()

  useEffect(() => {
    const onHashChange = () => {
      setView(viewFromHash())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Summary parts a person queued go out when the app opens and whenever signal comes back.
  useEffect(() => {
    const send = () => void sendOutboxNow().catch(() => {})
    send()
    window.addEventListener('online', send)
    return () => window.removeEventListener('online', send)
  }, [])

  const current = (v: View) => (view === v ? ('page' as const) : undefined)
  const owner = operator.owner_name

  return (
    <div className="page">
      <div className="app">
        <header className="app-header">
          <a className="wordmark" href="#messages">
            <img src="/favicon.svg" alt="" width="32" height="32" />
            <span className="wordmark-name">Stepping Stones</span>
          </a>
          <a className="setup-link" href="#setup" aria-current={current('setup')}>
            {t('setup')}
          </a>
        </header>

        <main className="app-main">
          {view === 'messages' && <MessagesScreen />}
          {view === 'stones' && <StonesScreen />}
          {view === 'summary' && <SummaryScreen />}
          {view === 'setup' && <SetupScreen />}
        </main>

        <nav className="tabs" aria-label={t('nav_label')}>
          {TABS.map((tab) => (
            <a key={tab.view} href={`#${tab.view}`} aria-current={current(tab.view)}>
              {t(tab.label, { owner })}
            </a>
          ))}
        </nav>
      </div>

      <aside className="side-note" aria-labelledby="side-note-title">
        <h2 id="side-note-title">{t('side_title')}</h2>
        <p>{t('side_body_1', { owner })}</p>
        <p>{t('side_body_2')}</p>
        <p>{t('side_body_3')}</p>
      </aside>
    </div>
  )
}

export default App
