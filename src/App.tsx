import { useEffect, useState } from 'react'
import { operator } from './operator/active.ts'
import { MessagesScreen } from './screens/MessagesScreen.tsx'
import { StonesScreen } from './screens/StonesScreen.tsx'
import { SummaryScreen } from './screens/SummaryScreen.tsx'
import { ThisPhoneScreen } from './screens/ThisPhoneScreen.tsx'

const VIEWS = ['messages', 'stones', 'summary', 'this-phone'] as const
type View = (typeof VIEWS)[number]

function viewFromHash(): View {
  const hash = window.location.hash.slice(1)
  return (VIEWS as readonly string[]).includes(hash) ? (hash as View) : 'messages'
}

const TABS: { view: View; label: string }[] = [
  { view: 'messages', label: 'Messages' },
  { view: 'stones', label: 'Stones' },
  { view: 'summary', label: `${operator.owner_name}'s SMS` },
]

function App() {
  const [view, setView] = useState<View>(viewFromHash)

  useEffect(() => {
    const onHashChange = () => {
      setView(viewFromHash())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const current = (v: View) => (view === v ? ('page' as const) : undefined)

  return (
    <div className="page">
      <div className="app">
        <header className="app-header">
          <a className="wordmark" href="#messages">
            <img src="/favicon.svg" alt="" width="30" height="30" />
            Stepping Stones
          </a>
          <a className="phone-link" href="#this-phone" aria-current={current('this-phone')}>
            This phone
          </a>
        </header>

        <main className="app-main">
          {view === 'messages' && <MessagesScreen />}
          {view === 'stones' && <StonesScreen />}
          {view === 'summary' && <SummaryScreen />}
          {view === 'this-phone' && <ThisPhoneScreen />}
        </main>

        <nav className="tabs" aria-label="Sections">
          {TABS.map((tab) => (
            <a key={tab.view} href={`#${tab.view}`} aria-current={current(tab.view)}>
              {tab.label}
            </a>
          ))}
        </nav>
      </div>

      <aside className="side-note" aria-labelledby="side-note-title">
        <h2 id="side-note-title">Demo mode</h2>
        <p>
          This is the app from the shared family phone at {operator.display_name}. Visitors text their answers, and the
          phone gets new messages whenever it has signal.
        </p>
        <p>
          Without a sync code you can still try it: load sample history under This phone, or paste a text message on
          Messages.
        </p>
        <p>
          Sample history is synthetic. Those visits and messages were made up for this demo, and each one is marked
          “Sample, synthetic”.
        </p>
      </aside>
    </div>
  )
}

export default App
