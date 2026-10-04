/**
 * Posts a correctly signed fake inbound SMS to <baseUrl>/api/sms/inbound.
 *
 *   set -a; source .env.local; set +a
 *   npm run webhook:test -- https://<production-domain> ["optional message body"]
 *
 * Reads TWILIO_AUTH_TOKEN (required), TWILIO_ACCOUNT_SID and TWILIO_PHONE_NUMBER (optional) from the
 * environment. Never prints them. The server validates against PUBLIC_BASE_URL, so <baseUrl> must equal it.
 */
import { randomBytes } from 'node:crypto'
import twilio from 'twilio'

const DEFAULT_BODY =
  "1) A friend at my hostel told me about Noor's coffee tour. 2) I'd tell my friends you can meet a coffee farmer and taste coffee from her farm."
// Twilio's magic test number. Not a real sender.
const FAKE_FROM = '+15005550006'

const [baseUrl, body = DEFAULT_BODY] = process.argv.slice(2)
if (!baseUrl || !/^https?:\/\//.test(baseUrl)) {
  console.error('Usage: npm run webhook:test -- https://<production-domain> ["optional message body"]')
  process.exit(1)
}
const authToken = process.env.TWILIO_AUTH_TOKEN
if (!authToken) {
  console.error('TWILIO_AUTH_TOKEN is not set in this shell. Run: set -a; source .env.local; set +a')
  process.exit(1)
}

const url = baseUrl.replace(/\/+$/, '') + '/api/sms/inbound'
const messageSid = 'SM' + randomBytes(16).toString('hex')
const params: Record<string, string> = {
  ToCountry: 'US',
  SmsMessageSid: messageSid,
  NumMedia: '0',
  SmsSid: messageSid,
  SmsStatus: 'received',
  Body: body,
  To: process.env.TWILIO_PHONE_NUMBER || '+15005550006',
  NumSegments: '1',
  MessageSid: messageSid,
  AccountSid: process.env.TWILIO_ACCOUNT_SID || 'AC' + '0'.repeat(32),
  From: FAKE_FROM,
  FromCountry: 'US',
  ApiVersion: '2010-04-01',
}

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'content-type': 'application/x-www-form-urlencoded',
    'x-twilio-signature': twilio.getExpectedTwilioSignature(authToken, url, params),
  },
  body: new URLSearchParams(params).toString(),
})

console.log(`POST ${url} -> ${response.status}`)
console.log(`MessageSid: ${messageSid}`)
console.log(`Response body: ${(await response.text()).slice(0, 200)}`)
if (response.status === 403) {
  console.log(
    'Signature rejected. The base URL you passed must exactly match PUBLIC_BASE_URL on the server, ' +
      'and TWILIO_AUTH_TOKEN in this shell must match the deployed value.',
  )
}
process.exit(response.ok ? 0 : 1)
