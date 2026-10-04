import { route } from '../../server/env.js'
import { handleAck } from '../../server/handlers.js'

export const POST = route(handleAck)
