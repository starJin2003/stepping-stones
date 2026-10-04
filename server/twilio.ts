import twilio from 'twilio'

export function isValidTwilioSignature(
  authToken: string,
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!authToken || !signature) return false
  return twilio.validateRequest(authToken, signature, url, params)
}

/** The slice of the Twilio REST client we use. The real client satisfies it; tests pass a fake. */
export interface TwilioClientLike {
  messages: {
    (sid: string): {
      update(params: { body: string }): Promise<unknown>
      remove(): Promise<boolean>
    }
    create(params: { to: string; from: string; body: string }): Promise<{ sid: string; status: string }>
  }
}

export interface EraseFailure {
  step: 'redact' | 'remove'
  status?: number
  code?: number
}

/** Outcome for one SID. In the normal case both redacted and removed are true. */
export interface EraseResult {
  redacted: boolean
  removed: boolean
  alreadyGone: boolean
  failures: EraseFailure[]
}

export interface TwilioMessaging {
  /** Redacts, then deletes, one message in Twilio's message log. Never throws; failures are in the result. */
  eraseMessage(sid: string): Promise<EraseResult>
  /** Sends to NOOR_PHONE_NUMBER. There is deliberately no way to pass a recipient. */
  sendToNoor(text: string): Promise<{ sid: string; status: string }>
}

export function createTwilioMessaging(
  client: TwilioClientLike,
  numbers: { from: string; noor: string },
): TwilioMessaging {
  return {
    async eraseMessage(sid) {
      const result: EraseResult = { redacted: false, removed: false, alreadyGone: false, failures: [] }
      const message = client.messages(sid)

      // Redact first: Twilio accepts a DELETE but the record can stay readable through the API for a while.
      // An empty Body is Twilio's documented redaction, and the only value we ever write to an existing message.
      try {
        await message.update({ body: '' })
        result.redacted = true
      } catch (err) {
        const { status, code } = errorInfo(err)
        if (status === 404) {
          result.alreadyGone = true
          return result
        }
        result.failures.push({ step: 'redact', status, code })
      }

      try {
        await message.remove()
        result.removed = true
      } catch (err) {
        const { status, code } = errorInfo(err)
        if (status === 404) result.alreadyGone = true
        else result.failures.push({ step: 'remove', status, code })
      }
      return result
    },
    async sendToNoor(text) {
      const message = await client.messages.create({ to: numbers.noor, from: numbers.from, body: text })
      return { sid: message.sid, status: message.status }
    },
  }
}

/**
 * Loggable fields of an error. Never the message: Twilio error messages can contain phone numbers.
 */
export function errorInfo(err: unknown): { name: string; status?: number; code?: number } {
  if (typeof err !== 'object' || err === null) return { name: typeof err }
  const { name, status, code } = err as { name?: unknown; status?: unknown; code?: unknown }
  return {
    name: typeof name === 'string' ? name : 'Error',
    status: typeof status === 'number' ? status : undefined,
    code: typeof code === 'number' ? code : undefined,
  }
}
