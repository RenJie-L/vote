import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchPolls, type PollSummary } from '../api'

export function PollListPage() {
  const [polls, setPolls] = useState<PollSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPolls()
      .then((data) => {
        if (!cancelled) setPolls(data)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : '加载失败'
          const network =
            msg === 'Failed to fetch' ||
            msg.includes('NetworkError') ||
            msg.includes('ERR_CONNECTION')
          setError(
            network
              ? `${msg}。请确认已在项目根目录运行 npm run dev（需同时启动 server 与 client）。`
              : msg,
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div>
        <h1>全部议题</h1>
        <p className="error">{error}</p>
      </div>
    )
  }

  if (polls === null) {
    return (
      <div>
        <h1>全部议题</h1>
        <p className="muted">加载中…</p>
      </div>
    )
  }

  if (polls.length === 0) {
    return (
      <div>
        <h1>全部议题</h1>
        <p className="muted">暂无投票。请先</p>
        <p>
          <Link to="/new">新建投票</Link>
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1>全部议题</h1>
      <ul className="poll-list">
        {polls.map((p) => (
          <li key={p.id}>
            <Link to={`/poll/${p.id}`}>
              <strong>{p.title}</strong>
              <span className="muted"> · {p.optionCount} 个选项</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
