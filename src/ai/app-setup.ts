// The analysis setup for the active operator. Light: no model and no language library, so the app can
// tell which records are out of date without loading the analysis code.
import { operator } from '../operator/active.ts'
import { visitReasonPrototypes } from '../operator/config.ts'
import { KIK_FUNCTION_WORDS, REFERRAL_PROTOTYPES, REFERRAL_RULES, THRESHOLDS } from './config.ts'
import { MODEL } from './model.ts'
import { analysisVersion, type AnalysisSetup } from './setup.ts'

export const SETUP: AnalysisSetup = {
  thresholds: THRESHOLDS,
  functionWords: KIK_FUNCTION_WORDS,
  visitReasonPrototypes: visitReasonPrototypes(operator),
  referralPrototypes: REFERRAL_PROTOTYPES,
  referralRules: REFERRAL_RULES,
  modelRevision: `${MODEL.revision}@${MODEL.measuredAtCommit}`,
}

export const ANALYSIS_VERSION = analysisVersion(SETUP)
