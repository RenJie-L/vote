import { randomUUID } from 'node:crypto'
import type { Request, Response, Router } from 'express'
import express from 'express'
import type { SqliteDb } from '../db.js'

function jsonError(res: Response, status: number, message: string) {
  return res.status(status).json({ error: message })
}

export function createPollsRouter(db: SqliteDb): Router {
  const router = express.Router()

  router.get('/polls', (_req: Request, res: Response) => {
    const rows = db
      .prepare(
        `
        SELECT p.id, p.title, p.created_at AS createdAt, COUNT(o.id) AS optionCount
        FROM polls p
        LEFT JOIN poll_options o ON o.poll_id = p.id
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `,
      )
      .all() as {
        id: string
        title: string
        createdAt: number
        optionCount: number
      }[]

    res.json(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        createdAt: r.createdAt,
        optionCount: r.optionCount,
      })),
    )
  })

  router.post('/polls', (req: Request, res: Response) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
    const rawOptions = req.body?.options
    if (!title) {
      return jsonError(res, 400, '标题不能为空')
    }
    if (!Array.isArray(rawOptions) || rawOptions.length < 2) {
      return jsonError(res, 400, '至少需要两个选项')
    }
    const options = rawOptions.map((o) => String(o).trim()).filter(Boolean)
    if (options.length < 2) {
      return jsonError(res, 400, '每个选项不能为空')
    }

    const pollId = randomUUID()
    const createdAt = Date.now()

    const insertPoll = db.prepare(
      `INSERT INTO polls (id, title, created_at) VALUES (?, ?, ?)`,
    )
    const insertOption = db.prepare(
      `INSERT INTO poll_options (id, poll_id, label, sort_order) VALUES (?, ?, ?, ?)`,
    )

    try {
      db.transaction(() => {
        insertPoll.run(pollId, title, createdAt)
        options.forEach((label, i) => {
          insertOption.run(randomUUID(), pollId, label, i)
        })
      })
    } catch {
      return jsonError(res, 500, '创建失败')
    }

    return res.status(201).json({ id: pollId })
  })

  router.get('/polls/:id', (req: Request, res: Response) => {
    const pollId = req.params.id
    const voterSession = req.voterSession
    if (!voterSession) {
      return jsonError(res, 500, '会话异常')
    }

    const poll = db
      .prepare(`SELECT id, title, created_at AS createdAt FROM polls WHERE id = ?`)
      .get(pollId) as { id: string; title: string; createdAt: number } | undefined

    if (!poll) {
      return jsonError(res, 404, '议题不存在')
    }

    const optionRows = db
      .prepare(
        `
        SELECT o.id, o.label, o.sort_order AS sortOrder
        FROM poll_options o
        WHERE o.poll_id = ?
        ORDER BY o.sort_order ASC, o.id ASC
      `,
      )
      .all(pollId) as { id: string; label: string; sortOrder: number }[]

    const counts = db
      .prepare(
        `
        SELECT option_id AS optionId, COUNT(*) AS c
        FROM votes
        WHERE poll_id = ?
        GROUP BY option_id
      `,
      )
      .all(pollId) as { optionId: string; c: number }[]

    const countMap = new Map(counts.map((x) => [x.optionId, x.c]))
    const totalVotes = counts.reduce((s, x) => s + x.c, 0)

    const existingVote = db
      .prepare(
        `SELECT option_id AS optionId FROM votes WHERE poll_id = ? AND voter_session = ?`,
      )
      .get(pollId, voterSession) as { optionId: string } | undefined

    const options = optionRows.map((o) => {
      const voteCount = countMap.get(o.id) ?? 0
      const percent =
        totalVotes === 0 ? 0 : Math.round((voteCount * 10000) / totalVotes) / 100
      return {
        id: o.id,
        label: o.label,
        sortOrder: o.sortOrder,
        voteCount,
        percent,
      }
    })

    res.json({
      id: poll.id,
      title: poll.title,
      createdAt: poll.createdAt,
      options,
      hasVoted: Boolean(existingVote),
      votedOptionId: existingVote?.optionId ?? null,
      totalVotes,
    })
  })

  router.post('/polls/:id/votes', (req: Request, res: Response) => {
    const pollId = req.params.id
    const voterSession = req.voterSession
    if (!voterSession) {
      return jsonError(res, 500, '会话异常')
    }

    const optionId =
      typeof req.body?.optionId === 'string' ? req.body.optionId.trim() : ''
    if (!optionId) {
      return jsonError(res, 400, '请选择选项')
    }

    const poll = db.prepare(`SELECT id FROM polls WHERE id = ?`).get(pollId)
    if (!poll) {
      return jsonError(res, 404, '议题不存在')
    }

    const belongs = db
      .prepare(`SELECT id FROM poll_options WHERE id = ? AND poll_id = ?`)
      .get(optionId, pollId)
    if (!belongs) {
      return jsonError(res, 400, '选项无效')
    }

    const voteId = randomUUID()
    try {
      db.prepare(
        `INSERT INTO votes (id, poll_id, option_id, voter_session) VALUES (?, ?, ?, ?)`,
      ).run(voteId, pollId, optionId, voterSession)
    } catch (e: unknown) {
      const code = (e as { code?: string }).code
      const msg = e instanceof Error ? e.message : String(e)
      if (
        code === 'SQLITE_CONSTRAINT_UNIQUE' ||
        code === 'SQLITE_CONSTRAINT' ||
        msg.includes('UNIQUE')
      ) {
        return jsonError(res, 409, '您已经投过票')
      }
      throw e
    }

    return res.status(204).send()
  })

  return router
}
