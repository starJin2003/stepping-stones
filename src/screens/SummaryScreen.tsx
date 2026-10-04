import { operator } from '../operator/active.ts'

export function SummaryScreen() {
  return (
    <>
      <h1>{operator.owner_name}'s SMS</h1>
      <p>No summaries for {operator.owner_name} yet.</p>
    </>
  )
}
