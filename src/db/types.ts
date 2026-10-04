import type { Lang } from '../i18n/strings.ts'

export type MatchStrength = 'Strong' | 'Possible' | 'Unclear'
export type ReviewStatus = 'Pending' | 'Confirmed' | 'Rejected'
export type CreatedFrom = 'SMS' | 'Paste' | 'Seed'

/** One visitor message on this phone. Field names follow the device data model. Analysis fields stay null until analyzed. */
export interface VisitRecord {
  /** Twilio MessageSid for SMS; a generated id for Paste and Seed. */
  record_id: string
  /** Null for pasted text, which has no sender. */
  sender_hash: string | null
  received_at: string
  raw_text_local: string
  incoming_story_text: string | null
  outgoing_story_text: string | null
  format_ok: boolean | null
  detected_language: string | null
  referral_source_category: string | null
  /** Which Heard from rule fired ("lodging+guest", "conflict:guide+online"), "embedding" when the model decided. */
  referral_rule: string | null
  visit_reason_category: string | null
  pass_on_category: string | null
  incoming_embedding: Float32Array | null
  outgoing_embedding: Float32Array | null
  candidate_prior_record_ids: string[] | null
  match_strength: MatchStrength | null
  review_status: ReviewStatus
  confirmed_prior_record_id: string | null
  created_from: CreatedFrom
  synthetic: boolean
  /** Which analysis produced the fields above; records are redone when prototypes or thresholds change. Null until analysed. */
  analysis_version: string | null
}

export type OutboxStatus = 'Queued' | 'Sent' | 'Failed'

export interface OutboxItem {
  id: string
  text: string
  created_at: string
  status: OutboxStatus
  sid: string | null
}

/** The app always talks to the site it was loaded from, so there is no server address to set. */
export interface Settings {
  sync_token: string
  /** UI language. Record text is never translated. */
  ui_language: Lang
  /** When the last summary was queued for the owner. The next summary covers visits received after it. */
  last_summary_at: string
}

export type SettingKey = keyof Settings

export interface SettingRow {
  key: SettingKey
  value: string
}

type NewRecordFields = Pick<VisitRecord, 'record_id' | 'sender_hash' | 'received_at' | 'raw_text_local' | 'created_from' | 'synthetic'> &
  Partial<Pick<VisitRecord, 'review_status' | 'confirmed_prior_record_id'>>

/** A record with every analysis field empty and review Pending unless given. */
export function newRecord(fields: NewRecordFields): VisitRecord {
  return {
    incoming_story_text: null,
    outgoing_story_text: null,
    format_ok: null,
    detected_language: null,
    referral_source_category: null,
    referral_rule: null,
    visit_reason_category: null,
    pass_on_category: null,
    incoming_embedding: null,
    outgoing_embedding: null,
    candidate_prior_record_ids: null,
    match_strength: null,
    review_status: 'Pending',
    confirmed_prior_record_id: null,
    analysis_version: null,
    ...fields,
  }
}
