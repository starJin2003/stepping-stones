// Every UI string, in Kiswahili and English, with the same keys. Kiswahili is machine translation, review pending.
// Never put record text here: what a tourist wrote is shown exactly as written.
// {name} placeholders are filled by translate(). Counts use separate _one and _other keys.

export type Lang = 'sw' | 'en'
export const DEFAULT_LANG: Lang = 'sw'

/** Each language named in itself, for the toggle. */
export const LANGUAGE_NAMES: Record<Lang, string> = { sw: 'Kiswahili', en: 'English' }

/** Locale for Intl month names in visitor labels. en-US gives "Sep", matching "Visitor 3, Aug 2026". */
export const DATE_LOCALE: Record<Lang, string> = { sw: 'sw-KE', en: 'en-US' }

const sw = {
  // Shell
  nav_label: 'Sehemu',
  nav_messages: 'Jumbe',
  nav_stones: 'Mawe',
  nav_summary: 'SMS ya {owner}',
  this_phone: 'Simu hii',
  language_label: 'Lugha',
  side_title: 'Hali ya maonyesho',
  side_body_1:
    'Hii ndiyo programu kwenye simu ya familia ya {owner}. Wageni hutuma majibu yao kwa SMS, na simu hupokea jumbe mpya inapopata mtandao.',
  side_body_2:
    'Bila msimbo wa kusawazisha bado unaweza kujaribu: pakia historia ya mfano kwenye Simu hii, au bandika ujumbe kwenye Jumbe.',
  side_body_3:
    'Historia ya mfano ni ya kubuni. Ziara na jumbe hizo zilibuniwa kwa maonyesho haya, na kila moja imeandikwa “Mfano, wa kubuni”.',

  // Messages
  todo_one: 'Ujumbe 1 wa kukagua',
  todo_other: 'Jumbe {n} za kukagua',
  todo_none: 'Hakuna cha kukagua',
  sync: 'Sawazisha',
  syncing: 'Inasawazisha',
  sync_saved_one: 'Ujumbe 1 mpya umehifadhiwa kwenye simu hii.',
  sync_saved_other: 'Jumbe {n} mpya zimehifadhiwa kwenye simu hii.',
  sync_nothing_new: 'Hakuna jumbe mpya.',
  sync_ack_failed: 'Zimehifadhiwa kwenye simu hii. Nakala ya seva itafutwa wakati ujao.',
  sync_unauthorized: 'Msimbo wa kusawazisha haukukubaliwa. Ukague kwenye Simu hii.',
  sync_offline: 'Hakuna mtandao. Jumbe zako ziko salama kwenye simu hii. Jaribu tena ukipata mtandao.',
  sync_no_code: 'Kwanza weka msimbo wa kusawazisha kwenye Simu hii.',
  sync_server_error: 'Seva ina tatizo. Jumbe zako ziko salama kwenye simu hii. Jaribu tena baadaye.',
  sync_write_failed: 'Imeshindwa kuhifadhi kwenye simu hii, kwa hiyo hakuna kilichofutwa kwenye seva. Jaribu tena.',
  paste_open: 'Bandika SMS',
  paste_label: 'Ujumbe wa SMS',
  paste_hint: 'Wageni hujibu maswali mawili ya kwenye kadi:',
  paste_add: 'Ongeza ujumbe',
  paste_empty: 'Bandika au andika ujumbe kwanza.',
  paste_added: 'Ujumbe umeongezwa.',
  paste_failed: 'Imeshindwa kuhifadhi ujumbe kwenye simu hii. Jaribu tena.',
  empty_title: 'Bado hakuna jumbe kwenye simu hii.',
  empty_body: 'Sawazisha, bandika ujumbe, au pakia historia ya mfano uone jinsi programu inavyofanya kazi.',
  list_label: 'Jumbe, mpya kwanza',
  visitor: 'Mgeni {n}, {month}',
  source_sms: 'SMS',
  source_paste: 'Umebandikwa',
  source_seed: 'Mfano, wa kubuni',
  status_pending: 'Inasubiri ukaguzi',
  status_rejected: 'Haujaunganishwa',
  status_confirmed: 'Umeunganishwa na {visitor}',
  status_confirmed_unknown: 'Umeunganishwa na mgeni wa awali',
  confirm: 'Thibitisha',

  // Stones and the owner's SMS
  stones_title: 'Mawe',
  stones_none: 'Bado hakuna mawe. Viungo vilivyothibitishwa kati ya wageni vitaonekana hapa.',
  stones_count_one: 'Kiungo 1 kilichothibitishwa kati ya wageni.',
  stones_count_other: 'Viungo {n} vilivyothibitishwa kati ya wageni.',
  summary_title: 'SMS ya {owner}',
  summary_none: 'Bado hakuna muhtasari kwa {owner}.',

  // This phone
  phone_title: 'Simu hii',
  server_title: 'Anwani ya seva',
  server_hint: 'Acha wazi ili kutumia tovuti hii.',
  server_placeholder: 'Sawa na tovuti hii',
  server_save: 'Hifadhi anwani',
  server_invalid: 'Andika anwani kamili inayoanza na https://, au iache wazi.',
  server_saved: 'Anwani ya seva imehifadhiwa.',
  server_cleared: 'Simu hii itatumia tovuti hii.',
  code_title: 'Msimbo wa kusawazisha',
  code_present: 'Msimbo wa kusawazisha umehifadhiwa kwenye simu hii.',
  code_missing: 'Bado hakuna msimbo. Bila msimbo, simu hii haiwezi kusawazisha.',
  code_enter: 'Andika msimbo',
  code_replace: 'Badilisha msimbo',
  code_save: 'Hifadhi msimbo',
  code_forget: 'Sahau msimbo',
  code_empty: 'Andika msimbo kwanza.',
  code_saved: 'Msimbo umehifadhiwa kwenye simu hii.',
  code_forgotten: 'Msimbo umeondolewa. Uweke tena ili kusawazisha.',
  storage_title: 'Hifadhi ya simu',
  storage_granted: 'Salama. Kivinjari hakitafuta jumbe kwenye simu hii ili kupata nafasi.',
  storage_not_granted:
    'Haijahakikishwa. Kivinjari kinaweza kufuta jumbe nafasi ikiisha. Kuweka programu kwenye skrini ya mwanzo husaidia.',
  storage_unsupported: 'Kivinjari hiki hakiwezi kuahidi kuhifadhi jumbe nafasi ikiisha.',
  storage_checking: 'Inaangalia.',
  sample_title: 'Historia ya mfano',
  sample_body:
    'Historia ya mfano ni ya kubuni: ziara za zamani zilizobuniwa ili kuonyesha jinsi kuunganisha kunavyofanya kazi. Kuiondoa kunafuta jumbe za mfano tu.',
  sample_count_one: 'Ujumbe 1 wa mfano kwenye simu hii.',
  sample_count_other: 'Jumbe {n} za mfano kwenye simu hii.',
  sample_none: 'Hakuna historia ya mfano kwenye simu hii.',
  sample_load: 'Pakia historia ya mfano (ya kubuni)',
  sample_remove: 'Ondoa historia ya mfano',
  sample_loaded: 'Historia ya mfano imepakiwa: ziara {n} za kubuni.',
  sample_already: 'Historia ya mfano tayari iko kwenye simu hii.',
  sample_removed: 'Historia ya mfano imeondolewa.',
  sample_nothing: 'Hakukuwa na historia ya mfano ya kuondoa.',
  sample_failed: 'Imeshindwa kubadilisha historia ya mfano kwenye simu hii. Jaribu tena.',
  language_title: 'Lugha',
  language_note: 'Maandishi ya Kiswahili katika programu hii yametafsiriwa kwa mashine na bado hayajakaguliwa.',

  // On-device model download (used in task 2)
  model_title: 'Modeli ya AI, MB {mb}',
  model_data: 'Inatumia data ya simu',
  model_why: 'Inapakuliwa mara moja tu, ili uchambuzi ufanye kazi bila mtandao.',
  model_download: 'Pakua modeli',
  model_progress: 'Inapakua: MB {done} kati ya {total}',

  // Referral sources (fixed taxonomy, same for every operator)
  referral_friend_family: 'Rafiki au familia',
  referral_guesthouse_staff: 'Mfanyakazi wa nyumba ya wageni',
  referral_guesthouse_guest: 'Mgeni wa nyumba ya wageni',
  referral_local_guide: 'Kiongozi wa watalii wa eneo hili',
  referral_social_online: 'Mitandao ya kijamii au mtandaoni',
  referral_other: 'Nyingine',
  referral_unclear: 'Haiko wazi',
} satisfies Record<string, string>

export type StringKey = keyof typeof sw

const en: Record<StringKey, string> = {
  // Shell
  nav_label: 'Sections',
  nav_messages: 'Messages',
  nav_stones: 'Stones',
  nav_summary: "{owner}'s SMS",
  this_phone: 'This phone',
  language_label: 'Language',
  side_title: 'Demo mode',
  side_body_1:
    "This is the app on {owner}'s family phone. Visitors text their answers, and the phone gets new messages whenever it has signal.",
  side_body_2: 'Without a sync code you can still try it: load sample history under This phone, or paste a message on Messages.',
  side_body_3:
    'Sample history is synthetic. Those visits and messages were made up for this demo, and each one is marked “Sample, synthetic”.',

  // Messages
  todo_one: '1 message to check',
  todo_other: '{n} messages to check',
  todo_none: 'Nothing to check',
  sync: 'Sync',
  syncing: 'Syncing',
  sync_saved_one: '1 new message saved on this phone.',
  sync_saved_other: '{n} new messages saved on this phone.',
  sync_nothing_new: 'No new messages.',
  sync_ack_failed: 'Saved on this phone. The server copy will be cleared next time.',
  sync_unauthorized: "This phone's sync code was not accepted. Check it under This phone.",
  sync_offline: 'No connection. Your messages are safe on this phone. Try again when you have signal.',
  sync_no_code: "Add this phone's sync code under This phone first.",
  sync_server_error: 'The server had a problem. Your messages are safe on this phone. Try again later.',
  sync_write_failed: 'Could not save on this phone, so nothing was cleared from the server. Try again.',
  paste_open: 'Paste an SMS',
  paste_label: 'Text message',
  paste_hint: 'Visitors answer the two questions on the card:',
  paste_add: 'Add message',
  paste_empty: 'Paste or type a message first.',
  paste_added: 'Message added.',
  paste_failed: 'Could not save the message on this phone. Try again.',
  empty_title: 'No messages on this phone yet.',
  empty_body: 'Sync, paste a message, or load sample history to see how the app works.',
  list_label: 'Messages, newest first',
  visitor: 'Visitor {n}, {month}',
  source_sms: 'Text message',
  source_paste: 'Pasted',
  source_seed: 'Sample, synthetic',
  status_pending: 'To check',
  status_rejected: 'Not linked',
  status_confirmed: 'Linked to {visitor}',
  status_confirmed_unknown: 'Linked to an earlier visitor',
  confirm: 'Confirm',

  // Stones and the owner's SMS
  stones_title: 'Stones',
  stones_none: 'No stones yet. Confirmed links between visitors will appear here.',
  stones_count_one: '1 confirmed link between visitors so far.',
  stones_count_other: '{n} confirmed links between visitors so far.',
  summary_title: "{owner}'s SMS",
  summary_none: 'No summaries for {owner} yet.',

  // This phone
  phone_title: 'This phone',
  server_title: 'Server address',
  server_hint: 'Leave empty to use this site.',
  server_placeholder: 'Same as this site',
  server_save: 'Save address',
  server_invalid: 'Enter a full address starting with https://, or leave it empty.',
  server_saved: 'Server address saved.',
  server_cleared: 'This phone will use this site.',
  code_title: 'Sync code',
  code_present: 'A sync code is saved on this phone.',
  code_missing: 'No sync code yet. Without it, this phone cannot sync.',
  code_enter: 'Enter the sync code',
  code_replace: 'Replace the sync code',
  code_save: 'Save sync code',
  code_forget: 'Forget sync code',
  code_empty: 'Type the sync code first.',
  code_saved: 'Sync code saved on this phone.',
  code_forgotten: 'Sync code forgotten. Add it again to sync.',
  storage_title: 'Storage',
  storage_granted: 'Kept. The browser will not clear messages on this phone to free up space.',
  storage_not_granted:
    'Not guaranteed. The browser may clear messages if the phone runs low on space. Adding the app to the home screen usually helps.',
  storage_unsupported: 'This browser cannot promise to keep messages when space runs low.',
  storage_checking: 'Checking.',
  sample_title: 'Sample history',
  sample_body:
    'Sample history is synthetic: made-up past visits that show how linking works. Removing it deletes only the sample messages.',
  sample_count_one: '1 sample message on this phone.',
  sample_count_other: '{n} sample messages on this phone.',
  sample_none: 'No sample history on this phone.',
  sample_load: 'Load sample history (synthetic)',
  sample_remove: 'Remove sample history',
  sample_loaded: 'Sample history loaded: {n} synthetic visits.',
  sample_already: 'Sample history is already on this phone.',
  sample_removed: 'Sample history removed.',
  sample_nothing: 'There was no sample history to remove.',
  sample_failed: 'Could not change sample history on this phone. Try again.',
  language_title: 'Language',
  language_note: 'The Kiswahili text in this app is machine translation, review pending.',

  // On-device model download (used in task 2)
  model_title: 'AI model, {mb} MB',
  model_data: 'Uses mobile data',
  model_why: 'Downloaded once, so the analysis works with no signal.',
  model_download: 'Download model',
  model_progress: 'Downloading: {done} of {total} MB',

  // Referral sources (fixed taxonomy, same for every operator)
  referral_friend_family: 'Friend/Family',
  referral_guesthouse_staff: 'Guesthouse staff',
  referral_guesthouse_guest: 'Guesthouse guest',
  referral_local_guide: 'Local guide',
  referral_social_online: 'Social media/online',
  referral_other: 'Other',
  referral_unclear: 'Unclear',
}

export const STRINGS: Record<Lang, Record<StringKey, string>> = { sw, en }

export type Params = Record<string, string | number>
export type Translate = (key: StringKey, params?: Params) => string

export function translate(lang: Lang, key: StringKey, params: Params = {}): string {
  return STRINGS[lang][key].replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

/** Picks the _one or _other key for a count. */
export const countKey = <K extends StringKey>(n: number, one: K, other: K): K => (n === 1 ? one : other)

export const REFERRAL_SOURCES = [
  'friend_family',
  'guesthouse_staff',
  'guesthouse_guest',
  'local_guide',
  'social_online',
  'other',
  'unclear',
] as const
export type ReferralSource = (typeof REFERRAL_SOURCES)[number]

export const referralKey = (source: ReferralSource): StringKey => `referral_${source}`

export const isLang = (value: unknown): value is Lang => value === 'sw' || value === 'en'
