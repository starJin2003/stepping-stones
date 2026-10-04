import { useState } from 'react'
import { DOWNLOAD_BYTES, downloadModel, useModelStatus } from '../ai/client.ts'
import { toMB } from '../ai/model.ts'
import { useLanguage } from '../i18n/language.tsx'

/** Until the model is on this phone: what it is, what it costs, and a button. It never downloads by itself. */
export function ModelCard({ heading: Heading = 'h2' }: { heading?: 'h2' | 'h3' }) {
  const { t } = useLanguage()
  const model = useModelStatus()
  const [offline, setOffline] = useState(false)

  if (model.kind === 'checking' || model.kind === 'ready') return null
  if (model.kind === 'opening') return <p className="hint">{t('model_opening')}</p>

  const total = toMB(DOWNLOAD_BYTES)
  return (
    <section className="model-card" aria-labelledby="model-title">
      <Heading id="model-title">{t('model_title', { mb: total })}</Heading>
      {model.kind === 'downloading' ? (
        <>
          <progress max={DOWNLOAD_BYTES} value={model.loaded} aria-labelledby="model-title" />
          <p role="status">{t('model_progress', { done: toMB(model.loaded), total })}</p>
        </>
      ) : model.kind === 'failed' && model.during === 'open' ? (
        <p className="notice">{t('model_failed_open')}</p>
      ) : (
        <>
          <p className="lead">{t('model_data')}</p>
          <p>{t('model_why')}</p>
          {model.kind === 'failed' && <p className="notice">{t('model_failed_download')}</p>}
          <div>
            <button className="button button-secondary" type="button" onClick={() => setOffline(!downloadModel())}>
              {t('model_download')}
            </button>
          </div>
          <p className="notice" role="status">
            {offline && t('model_offline')}
          </p>
        </>
      )}
    </section>
  )
}
