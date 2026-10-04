# Data card

Every data source behind Stepping Stones: why the problem matters, what we build with, what we left out, and what our data does not cover.

## Problem evidence

| Source | Year | Country | Figure | Link |
|---|---|---|---|---|
| World Bank World Development Indicators (ST.INT.ARVL, ST.INT.RCPT.CD) | 2019, the latest year in WDI | Kenya | 2,049,000 international tourism arrivals. Receipts US$1.762 billion. | https://data.worldbank.org/indicator/ST.INT.ARVL?locations=KE |
| Kenya Ministry of Tourism and Wildlife, announced Feb 2025 | 2024 | Kenya | 2.4 million international arrivals. KES 452.2 billion tourism earnings. | https://capitalfm.africa/kenya-welcomes-7-5mn-visitors-in-2024/ |
| World Bank Enterprise Survey, from the World Bank Microdata Library | 2018 | Kenya | 51.4% of surveyed establishments (unweighted; 515 of 1,001) have their own website. The survey samples registered firms; an informal farm like Noor's is outside its sample. | https://microdata.worldbank.org/catalog/3585/variable/F1/V66?name=c22b |
| GSMA Mobile Gender Gap Report | 2025 | Low- and middle-income countries; Sub-Saharan Africa | Women are 14% less likely than men to use mobile internet. The gap is 29% in Sub-Saharan Africa. 61% of women own a smartphone. No Kenya-specific figure used. | https://www.gsma.com/newsroom/press-release/progress-closing-the-mobile-internet-gender-gap-stalls-in-lmics-gsma-mobile-gender-gap-report-2025 |
| World Bank Global Findex | 2025 report, 2024 data | Kenya; Sub-Saharan Africa | About 90% of Kenyan adults had an account in 2024, up from about 42% in 2011, driven by mobile money. 40% of adults in Sub-Saharan Africa had a mobile money account. | https://eastleighvoice.co.ke/mobile%20money%20platforms/186423/world-bank-mobile-money-fuels-114-per-cent-surge-in-financial-inclusion-in-kenya |

What each figure supports:

| Figure | Supports |
|---|---|
| Arrivals and receipts | Tourism is a large sector in Kenya. |
| Own website | 51.4% of surveyed establishments (unweighted) have their own website, in a sample of registered firms. Noor's informal farm is outside that sample, and the brief says it is not marketed on a digital platform. |
| Mobile internet gap | Noor's daily phone is a basic phone. The summary goes there by SMS. |
| Mobile money accounts | Phones are already part of daily business in Kenya. |

## Data we build with

### Public datasets and model

| Name | Source | License | Size | Used for |
|---|---|---|---|---|
| FLORES-200, dev split | NLLB Team, Meta AI, 2022. 25.6 MB tarball, 5 languages used: https://dl.fbaipublicfiles.com/nllb/flores200_dataset.tar.gz | CC BY-SA 4.0 | 997 sentences each in eng_Latn, swh_Latn, kik_Latn, deu_Latn, fra_Latn | Builds the Gĩkũyũ function words and the language means. Never used for reporting. |
| FLORES-200, devtest split | Same | CC BY-SA 4.0 | 1012 sentences each in the same 5 languages | Reporting only. Language ID on all 1012. Retrieval on 200 per language (every 5th line). |
| Xenova/multilingual-e5-small | Hugging Face. int8 ONNX of intfloat/multilingual-e5-small. Sizes measured at Hub commit 761b726, 2025-07-22. | MIT | Model 118.3 MB, tokenizer 17.1 MB. 384-dimension embeddings. | Every embedding, on the phone |
| onnxruntime-web wasm | npm package onnxruntime-web | MIT | 26.9 MB | Runs the model in the browser |

### Files we derived from FLORES-200 dev

| File | Size | How |
|---|---|---|
| [data/lid/kik-function-words.json](../data/lid/kik-function-words.json) | 80 words | In at least 2.5% of Gĩkũyũ dev sentences and at most 0.3% of each other language's. Top 80 by Gĩkũyũ share. |
| [data/ai/language-means.json](../data/ai/language-means.json) | 5 means, 384 dimensions each | Mean embedding of 997 dev sentences per language. Rounded to 5 decimals. |

### Data written for this project

| Data | File | Size | Languages | Label |
|---|---|---|---|---|
| Sample history | [data/seed/noor-coffee.synthetic.json](../data/seed/noor-coffee.synthetic.json) | 14 past visits, 2 demo SMS | English, Kiswahili, German, French | `synthetic: true`, file name, "Sample, synthetic" in the app |
| Eval dev split | [data/eval/dev.synthetic.json](../data/eval/dev.synthetic.json) | 40 records | English 12, German 10, French 8, Kiswahili 10 | `synthetic: true`, file name |
| Eval test split | [data/eval/test.synthetic.json](../data/eval/test.synthetic.json) | 40 records | French 12, Kiswahili 10, English 8, German 10 | `synthetic: true`, file name |
| Tour-part prototypes, Noor | [data/operators/noor-coffee.json](../data/operators/noor-coffee.json) | 160 sentences: 7 tour parts and Other, 5 per category per language | English originals; Kiswahili, German, French machine translation | "Written for this project" in the file |
| Stay-part prototypes, example guesthouse | [data/operators/example-guesthouse.json](../data/operators/example-guesthouse.json) | 80 sentences: 4 stay parts and Other, 4 per category per language | Same | Same |
| Referral prototypes | [data/ai/referral-prototypes.json](../data/ai/referral-prototypes.json) | 96 sentences: 6 categories, 4 per category per language | Same | Same |
| Referral word lists | [data/ai/referral-rules.json](../data/ai/referral-rules.json) | 236 entries in 7 lists | English, German, French, Kiswahili (review pending) | Same |
| Gĩkũyũ summary templates | [data/operators/noor-coffee.json](../data/operators/noor-coffee.json) | 3 SMS templates, a label per category | Gĩkũyũ, machine translation | "Native-speaker validation pending" in the file and the app |
| Interface strings | [src/i18n/strings.ts](../src/i18n/strings.ts) | One table per language, same keys | Kiswahili (machine translation, review pending), English | Noted in Setup |

No Gĩkũyũ prototype sentences exist, because we cannot validate them.

Eval record kinds, the same in both splits:

| Kind | Records | Right answer |
|---|---|---|
| Start | 7 | No earlier visitor |
| Link | 20 | One earlier visitor told this story |
| Near miss | 4 | A same-language visitor looks close. The source is another visitor or none. |
| Ambiguous | 5 | Two earlier visitors told the same story, so Unclear |
| Format | 4 | Answers 1) and 2) not found |

Referral word lists:

| List | Entries |
|---|---|
| Reporting verbs | 36 |
| Lodging | 24 |
| Fellow guest | 27 |
| Staff | 33 |
| Guide or driver | 14 |
| Friend or family | 61 |
| Online | 41 |

Split rules:

| Data | Builds or calibrates | Reports |
|---|---|---|
| FLORES-200 | dev | devtest |
| Synthetic eval | dev | test |
| Sample history and demo SMS | Neither | Neither |

### Real messages in the live system

| Data | Where | How long |
|---|---|---|
| Tourist SMS text and HMAC sender code | Upstash Redis | Until the phone syncs, 14 days at most |
| Same, after sync | The family phone (IndexedDB) | Kept on the phone |
| Twilio message log | Twilio | Text redacted and deletion requested on sync. Retention set to 7 days, a manual console setting; Twilio allows 7 to 400 ([Twilio](https://www.twilio.com/en-us/blog/new-data-controls-twilio-messaging)). Twilio states that message bodies may persist in database backups for up to 30 days after a delete request ([Twilio](https://support.twilio.com/hc/en-us/articles/223181008-Twilio-SMS-message-and-traffic-storage)). |
| Photos sent by MMS | Twilio | We never store media URLs, and the card does not ask for photos. [Twilio states](https://www.twilio.com/en-us/blog/new-data-controls-twilio-messaging) that deleting a message log also removes its media objects, unless the media is shared with another message. |
| Raw phone numbers | Nowhere | Replaced by the HMAC code on arrival |

No real tourist message is in this repository.

## Considered and not used

| Dataset | Reason |
|---|---|
| UN Tourism statistics | We cite the World Bank WDI tourism series for arrivals and receipts. |
| World Bank Data360 | We used WDI and the Microdata Library directly. |
| OPUS | Parallel text for translation. The product does not translate. |
| Masakhane | Not used in this build. A place to look for Gĩkũyũ resources and reviewers next. |
| AI4Bharat, IndicVoices | South Asian languages. |
| Common Voice, FLEURS, MMS | Speech data. The product is text SMS. |
| MASSIVE | No Gĩkũyũ. Its intent taxonomy does not match tour parts. |
| Yelp Open Dataset | US reviews. License terms. |
| Wikivoyage, OpenStreetMap | No link to this workflow. |
| WorldPop, VIIRS, HDX | Not relevant to word-of-mouth referrals. |
| OpenCelliD | Not needed. The phone works offline and syncs when it has signal. |

## What our data does not cover

| Gap | Effect |
|---|---|
| Real tourist messages | Every pipeline number comes from synthetic text written by us. |
| Kenyan code-switching and Sheng | FLORES-200 is clean single-language text. Mixed-language SMS are untested. |
| Gĩkũyũ input from tourists | Gĩkũyũ is tested on FLORES-200 only. No tourist SMS in Gĩkũyũ. |
| Response rates | Unknown how many tourists will text. |
| Visitors writing outside English, Kiswahili, German, French | Language ID is limited to those four plus Gĩkũyũ, so other languages get one of those labels. In a spot check, Italian came out French and Polish came out Kiswahili. Prototypes and word rules exist only in the four. |
| Gĩkũyũ summary quality | Not measured by any number. Needs a native speaker. |
| The human review step | Not measured. Every link is still confirmed or rejected by a person. |
