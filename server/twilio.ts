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
    (sid: string): { remove(): Promise<boolean> }
    create(params: { to: string; from: string; body: string }): Promise<{ sid: string; status: string }>
  }
}

export interface TwilioMessaging {
  /** Deletes a message from Twilio's message log. A message that is already gone counts as success. */
  removeMessage(sid: string): Promise<'removed' | 'already_gone'>
  /** Sends to NOOR_PHONE_NUMBER. There is deliberately no way to pass a recipient. */
  sendToNoor(text: string): Promise<{ sid: string; status: string }>
}

export function createTwilioMessaging(
  client: TwilioClientLike,
  numbers: { from: string; noor: string },
): TwilioMessaging {
  return {
    async removeMessage(sid) {
      try {
        await client.messages(sid).remove()
        return 'removed'
      } catch (err) {
        if (errorInfo(err).status === 404) return 'already_gone'
        throw err
      }
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
