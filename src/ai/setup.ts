import { hashOf, type PrototypeSentences, type Thresholds } from './config.ts'

/** Bump when parsing, language ID, classification or matching logic changes. */
export const PIPELINE_VERSION = 1

/** Everything the analysis depends on. Shared by the app and Node scripts. */
export interface AnalysisSetup {
  thresholds: Thresholds
  functionWords: ReadonlySet<string>
  visitReasonPrototypes: Record<string, PrototypeSentences>
  referralPrototypes: Record<string, PrototypeSentences>
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
    model: s.modelRevision,
  })

/** Identifies a set of prototype embeddings, so they can be stored and reused. */
export const prototypeKey = (s: AnalysisSetup): string =>
  hashOf({ visit: s.visitReasonPrototypes, referral: s.referralPrototypes, model: s.modelRevision })
