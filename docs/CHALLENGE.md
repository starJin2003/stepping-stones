# Challenge summary (paraphrased)

Our own summary of the Hack-Nation x World Bank "Small AI for Development" brief, Challenge 04, Track C: Tourism. The official PDF is not redistributed in this repo.

## Noor (fictional person, real constraints)

- 38, farms 2 hectares in the highlands: coffee on the upper slope, maize and beans below. Member of a coffee cooperative.
- Speaks her local language at home, the national language when needed.
- Two phones in the household: her own basic phone (calls, SMS, mobile money) and her daughter's smartphone, used mostly when the daughter is home on weekends.
- No Wi-Fi at the house. The family buys 3G data bundles when needed. For most of the day Noor is on the slope and the smartphone stays at the house.
- In this repo the setting is Kenya's Central Highlands, local language Gĩkũyũ (kik_Latn), national language Swahili.

## Tourism scenario

- Six or seven visitors a month find the farm by word of mouth. Visitors often arrive with a local guide translating.
- Noor has no way of knowing what value she created, what worked during visits, and what did not once visitors leave.
- Challenge: help Noor complete one meaningful business workflow. Examples given include learning from visitor feedback and following up with a guest.

## Rules

- Runs on a device the user already has.
- Core feature works offline.
- Model files small enough to side-load or send over a weak connection.
- At least one interaction in a local language (voice or text). Name the language and expect to be asked how the tool fares in a less-supported one.

## AI guardrails

- Human in the loop: a person makes the final call. The tool informs a decision and flags what it is unsure of. It does not act on the user's behalf.
- Avoid hallucinations. Prefer a fixed list of answers.
- Fail-safe: when the data is not enough for a definitive answer, say "not sure, ask a person" instead of guessing.

## Data requirements

- Cite every data source: source, year, country.
- For data we build with: name each dataset, its source, license, and size.
- State what our data does not cover. This is scored.
- Synthetic data is allowed if clearly labeled.

## Deliverables

1. The prototype, with code or a link to it.
2. A 2 to 5 minute video (required for the shortlist) covering:
   - Problem statement in one sentence: "Because of this tool, [user] will [action] by [when] that they would otherwise [not do / do late / do worse]; we know because [evidence]."
   - AI capabilities, why a simpler tool (SMS, a spreadsheet, a search) would not do the same job, and the guardrails.
   - End-to-end demo of the user journey.
   - Where the tool sits in the user's day: when they open it, what they do, what happens next. Tech stack details.
   - Our take: what localizing AI development means to us.

Hack-Nation additionally requires: public GitHub repo, live demo URL, team photo, and three videos of 60 seconds or less (team intro, product demo, technical walkthrough). Submission code for the World Bank track: WBGSmallAIGADS.

## Judging

| Criterion | Weight |
|---|---|
| Built solution: works end to end within the sector's constraints | 25% |
| Development relevance and impact | 20% |
| Data grounding: addresses an identified gap, sound data modeling | 15% |
| Evidence it works | 15% |
| Clarity, design, inclusivity; value proposition for AI vs simpler tools | 15% |
| Scalability, replicability, what happens next | 10% |
| Responsible AI, data and safety: privacy, consent, bias, human oversight | Pass / fail |

## Suggested datasets (tourism and common)

- Problem evidence: UN Tourism statistics; World Development Indicators tourism series; World Bank Enterprise Surveys; GSMA Mobile Gender Gap; Global Findex; OpenCelliD.
- Build and evaluation: FLORES-200 / NLLB-200; MASSIVE; Wikivoyage; OpenStreetMap via Overpass; Yelp Open Dataset (check license); Masakhane resources.
