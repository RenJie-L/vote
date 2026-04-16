import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPoll } from '../api'

export function CreatePollPage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function updateOption(i: number, value: string) {
    setOptions((prev) => {
      const next = [...prev]
      next[i] = value
      return next
    })
  }

  function addOption() {
    setOptions((prev) => [...prev, ''])
  }

  function removeOption(i: number) {
    if (options.length <= 2) return
    setOptions((prev) => prev.filter((_, j) => j !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmedTitle = title.trim()
    const trimmedOpts = options.map((o) => o.trim()).filter(Boolean)
    if (!trimmedTitle) {
      setError('请填写标题')
      return
    }
    if (trimmedOpts.length < 2) {
      setError('至少需要两个有效选项')
      return
    }
    setSubmitting(true)
    try {
      const { id } = await createPoll({ title: trimmedTitle, options: trimmedOpts })
      navigate(`/poll/${id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <h1>新建投票</h1>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="title">标题</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：团队周会时间"
            autoComplete="off"
          />
        </div>
        <div className="field">
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
            选项（至少两项）
          </span>
          {options.map((opt, i) => (
            <div key={i} className="row">
              <input
                type="text"
                value={opt}
                onChange={(e) => updateOption(i, e.target.value)}
                placeholder={`选项 ${i + 1}`}
                autoComplete="off"
              />
              {options.length > 2 && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => removeOption(i)}
                  aria-label={`删除选项 ${i + 1}`}
                >
                  删除
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn-ghost" onClick={addOption}>
            + 添加选项
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? '创建中…' : '创建'}
        </button>
      </form>
    </div>
  )
}
