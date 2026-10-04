import { hashOf, type PrototypeSentences, type ReferralRules, type Thresholds } from './config.ts'
import type { LanguageMeans } from './language-space.ts'

/**
 * Bump when parsing, language ID, classification or matching logic changes. 2: Heard from by rules on the source
 * span; matching on the content span. 3: optional centering by language and ratio-margin scoring.
 */
export const PIPELINE_VERSION = 3

/** Everything the analysis depends on. Shared by the app and Node scripts. */
export interface AnalysisSetup {
  thresholds: Thresholds
  functionWords: ReadonlySet<string>
  visitReasonPrototypes: Record<string, PrototypeSentences>
  referralPrototypes: Record<string, PrototypeSentences>
  referralRules: ReferralRules
  languageMeans: LanguageMeans
  modelRevision: string
}

/** Changes whenever prototypes, thresholds, function words, the model, or the pipeline change; records are redone then. */
export const analysisVersion = (s: AnalysisSetup): string =>
  hashOf({
    pipeline: PIPELINE_VERSION,
    thresholds: s.thresholds,
    words: [...s.functionWords].sort(),
    visit: s.visitReasonPrototypes,
    referral: s.referralPrototypes,
    rules: s.referralRules,
    // The means matter only while centering is on.
    means: s.thresholds.matching.center_by_language ? s.languageMeans : null,
    model: s.modelRevision,
  })

/** Identifies a set of prototype embeddings, so they can be stored and reused. */
export const prototypeKey = (s: AnalysisSetup): string =>
  hashOf({ visit: s.visitReasonPrototypes, referral: s.referralPrototypes, model: s.modelRevision })
