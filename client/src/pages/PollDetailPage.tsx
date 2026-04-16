import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchPoll, vote, type PollDetail } from '../api'

export function PollDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [poll, setPoll] = useState<PollDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [voteError, setVoteError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setError(null)
    try {
      const data = await fetchPoll(id)
      setPoll(data)
    } catch (e: unknown) {
      setPoll(null)
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function handleVote(optionId: string) {
    if (!id) return
    setVoteError(null)
    setSubmitting(true)
    try {
      await vote(id, optionId)
      await load()
    } catch (e: unknown) {
      setVoteError(e instanceof Error ? e.message : '投票失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (!id) {
    return <p className="error">无效的链接</p>
  }

  if (error) {
    return (
      <div>
        <p className="error">{error}</p>
        <p>
          <Link to="/">返回列表</Link>
        </p>
      </div>
    )
  }

  if (poll === null) {
    return (
      <div>
        <p className="muted">加载中…</p>
      </div>
    )
  }

  const canVote = !poll.hasVoted

  return (
    <div>
      <h1>{poll.title}</h1>
      <p className="muted" style={{ marginBottom: '1.25rem' }}>
        共 {poll.totalVotes} 票
        {poll.hasVoted && ' · 您已参与投票'}
      </p>

      {poll.hasVoted && (
        <div className="success-banner">感谢您的投票，以下为当前结果。</div>
      )}

      {voteError && <p className="error">{voteError}</p>}

      <div>
        {poll.options.map((o) => (
          <div key={o.id} className="option-block">
            {canVote ? (
              <input
                type="radio"
                name="vote"
                id={o.id}
                disabled={submitting}
                onChange={() => void handleVote(o.id)}
              />
            ) : null}
            <div className="option-bar-wrap">
              <div className="option-label-row">
                <label htmlFor={canVote ? o.id : undefined}>{o.label}</label>
                <span className="muted">
                  {o.voteCount} 票（{o.percent}%）
                </span>
              </div>
              <div className="bar" role="presentation">
                <div className="bar-fill" style={{ width: `${o.percent}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <p style={{ marginTop: '1.5rem' }}>
        <Link to="/">← 返回全部议题</Link>
      </p>
    </div>
  )
}
