import { useId } from 'react'
import type { MatchStrength } from '../db/types.ts'

// One irregular stepping stone. Filled = Strong, half-filled = Possible, outline = Unclear.
// Always shown next to the word, so strength never depends on colour or shape alone.
const STONE = 'M2.6 9.6C2.1 5.7 6.3 2.7 11.5 2.5c5.3-.2 9.8 2 10 5.9.2 4-3.5 7.2-9.3 7.4-5.6.2-9.2-2.4-9.6-6.2Z'

export function StoneGlyph({ strength }: { strength: MatchStrength }) {
  const clipId = `half-${useId().replace(/[^\w-]/g, '')}`
  const colour = strength === 'Unclear' ? 'var(--stone-grey)' : 'var(--stone-red)'
  return (
    <svg className="stone-glyph" viewBox="0 0 24 18" width="24" height="18" aria-hidden="true" focusable="false">
      {strength === 'Possible' && (
        <defs>
          <clipPath id={clipId}>
            <rect x="0" y="9" width="24" height="9" />
          </clipPath>
        </defs>
      )}
      {strength !== 'Unclear' && (
        <path d={STONE} fill={colour} clipPath={strength === 'Possible' ? `url(#${clipId})` : undefined} />
      )}
      <path d={STONE} fill="none" stroke={colour} strokeWidth="1.6" />
    </svg>
  )
}
