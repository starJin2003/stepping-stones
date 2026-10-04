import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db.ts'

export function StonesScreen() {
  const confirmed = useLiveQuery(() => db.records.where('review_status').equals('Confirmed').count())

  return (
    <>
      <h1>Stones</h1>
      {confirmed !== undefined && (
        <p>
          {confirmed === 0
            ? 'No stones yet. Confirmed links between visitors will appear here.'
            : `${confirmed} confirmed ${confirmed === 1 ? 'link' : 'links'} between visitors so far.`}
        </p>
      )}
    </>
  )
}
