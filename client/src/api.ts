/** 开发环境默认走 Vite 代理（同源 `/api`），避免页面在 5173 而 API 未启动时出现直连 3000 失败 */
function apiBase(): string {
  const v = import.meta.env.VITE_API_BASE
  if (typeof v === 'string' && v.trim().length > 0) {
    return v.replace(/\/$/, '')
  }
  if (import.meta.env.DEV) return ''
  return 'http://localhost:3000'
}

const base = apiBase()

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  if (!text) return {} as T
  return JSON.parse(text) as T
}

export type PollSummary = {
  id: string
  title: string
  createdAt: number
  optionCount: number
}

export type PollOptionDetail = {
  id: string
  label: string
  sortOrder: number
  voteCount: number
  percent: number
}

export type PollDetail = {
  id: string
  title: string
  createdAt: number
  options: PollOptionDetail[]
  hasVoted: boolean
  votedOptionId: string | null
  totalVotes: number
}

export async function fetchPolls(): Promise<PollSummary[]> {
  const res = await fetch(`${base}/api/polls`, { credentials: 'include' })
  if (!res.ok) {
    const err = await parseJson<{ error?: string }>(res)
    throw new Error(err.error ?? res.statusText)
  }
  return parseJson<PollSummary[]>(res)
}

export async function createPoll(body: {
  title: string
  options: string[]
}): Promise<{ id: string }> {
  const res = await fetch(`${base}/api/polls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  const data = await parseJson<{ id?: string; error?: string }>(res)
  if (!res.ok) throw new Error(data.error ?? res.statusText)
  if (!data.id) throw new Error('Invalid response')
  return { id: data.id }
}

export async function fetchPoll(id: string): Promise<PollDetail> {
  const res = await fetch(`${base}/api/polls/${encodeURIComponent(id)}`, {
    credentials: 'include',
  })
  const data = await parseJson<PollDetail & { error?: string }>(res)
  if (!res.ok) throw new Error(data.error ?? res.statusText)
  return data
}

export async function vote(pollId: string, optionId: string): Promise<void> {
  const res = await fetch(
    `${base}/api/polls/${encodeURIComponent(pollId)}/votes`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ optionId }),
    },
  )
  if (res.status === 409) {
    throw new Error('您已经投过票')
  }
  const data = await parseJson<{ error?: string }>(res)
  if (!res.ok) throw new Error(data.error ?? res.statusText)
}
