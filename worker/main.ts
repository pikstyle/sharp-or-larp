import { Hono } from 'hono'
import { analyze } from './analyze.ts'
import { ApiError } from './types.ts'

const app = new Hono<{ Bindings: Env }>()

app.post('/api/analyze', analyze)

// Turns any error thrown by a route into a JSON answer with its status code.
app.onError((error, c) => {
  if (error instanceof ApiError) {
    return c.json({ error: error.code }, error.status)
  }
  console.error(error)
  return c.json({ error: 'internal_error' }, 500)
})

export default app
