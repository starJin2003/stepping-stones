import { route } from '../../server/env.js'
import { handleOutboxSend } from '../../server/handlers.js'

export const POST = route(handleOutboxSend)
