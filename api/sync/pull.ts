import { route } from '../../server/env.js'
import { handlePull } from '../../server/handlers.js'

export const GET = route(handlePull)
