import { randomUUID } from 'node:crypto'
import path from 'node:path'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import { openDatabase } from './db.js'
import { createPollsRouter } from './routes/polls.js'

declare module 'express-serve-static-core' {
  interface Request {
    voterSession?: string
  }
}

const PORT = Number(process.env.PORT) || 3000
const databasePath =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'vote.db')

const app = express()

app.use(
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
  }),
)
app.use(express.json())
app.use(cookieParser())

function ensureVoterSession(req: Request, res: Response, next: NextFunction) {
  let sid = req.cookies?.voter_sid as string | undefined
  if (!sid) {
    sid = randomUUID()
    res.cookie('voter_sid', sid, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 400,
      path: '/',
    })
  }
  req.voterSession = sid
  next()
}

void (async () => {
  const db = await openDatabase(databasePath)
  app.use('/api', ensureVoterSession, createPollsRouter(db))

  app.use(
    (
      err: Error,
      _req: Request,
      res: Response,
      _next: NextFunction,
    ): void => {
      console.error(err)
      res.status(500).json({ error: '服务器错误' })
    },
  )

  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`)
  })
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
