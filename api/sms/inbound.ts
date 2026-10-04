import { route } from '../../server/env.js'
import { handleInbound } from '../../server/handlers.js'

export const POST = route(handleInbound)
