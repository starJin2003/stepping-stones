# Printed tourist card

Noor keeps a stack of these at the farm. Print the English side and the Kiswahili side back to back.

## English

> Help Noor learn how visitors find her farm.
>
> Text one message to **+1 959 600 7905**:
>
> 1) Who told you about Noor, and what did you hear?
> 2) What would you tell a friend about your visit?
>
> Any language is fine. Standard SMS rates apply.
>
> **Privacy:** Your answers are used only to help Noor understand how visitors hear about her tour, never for marketing. Our server replaces your phone number with a code. It deletes your message when Noor's family phone syncs it, or after 14 days at the latest. On sync it also deletes the message from the message log of our SMS provider, Twilio. That log is set to the shortest time Twilio allows: 7 days. Twilio and your mobile carrier also handle your number and message under their own policies.
>
> **No signal?** If your phone says the message was not sent, please send it again when you have signal.

## Kiswahili

_Machine translation, review pending._

> Msaidie Noor kujifunza jinsi wageni wanavyolipata shamba lake.
>
> Tuma ujumbe mmoja kwa **+1 959 600 7905**:
>
> 1) Nani alikuambia kuhusu Noor, na ulisikia nini?
> 2) Ungemwambia rafiki nini kuhusu ziara yako?
>
> Unaweza kuandika kwa lugha yoyote. Gharama za kawaida za SMS zinatozwa.
>
> **Faragha:** Majibu yako yanatumika tu kumsaidia Noor kuelewa jinsi wageni wanavyosikia kuhusu ziara yake, kamwe si kwa matangazo ya biashara. Seva yetu inabadilisha namba yako ya simu kuwa msimbo. Inafuta ujumbe wako simu ya familia ya Noor inapoupakua, na kwa vyovyote vile ndani ya siku 14. Simu inapoupakua, seva pia inaufuta ujumbe huo kwenye kumbukumbu ya ujumbe ya mtoa huduma wetu wa SMS, Twilio. Kumbukumbu hiyo imewekwa kwa muda mfupi zaidi ambao Twilio inaruhusu: siku 7. Twilio na kampuni yako ya simu pia hushughulikia namba yako na ujumbe wako kwa mujibu wa sera zao wenyewe.
>
> **Hakuna mtandao?** Simu yako ikionyesha kwamba ujumbe haujatumwa, tafadhali utume tena utakapopata mtandao.

## Claims the code must keep true

| Card claim | Where it holds |
|---|---|
| Phone number replaced with a code | `server/hmac.ts`, called in `server/handlers.ts` before storing. The raw `From` is never stored or logged. |
| Message deleted from our server after sync | `POST /api/sync/ack` deletes from Redis. |
| Deleted from the SMS provider's log after sync | `POST /api/sync/ack` calls Twilio `messages(sid).remove()` for each id. |
| Deleted from our server after 14 days at the latest | Redis TTL is 14 days (`INBOX_TTL_SECONDS`). |
| Twilio's log set to its shortest retention, 7 days | Twilio console: message retention 7 days, backup storage off (manual setting, not enforced in code). Twilio may keep data in back-end systems for up to 30 days after that. |
| Photos (the card does not ask for them) | We never store media URLs. Twilio deletes MMS media within 30 days after the retention period. The card does not ask for photos. |
| Never for marketing | No outbound SMS to tourists exists. The server only sends to `NOOR_PHONE_NUMBER`. |
