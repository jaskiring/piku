import { useState, useRef, useEffect } from 'react'
import { ProjectService } from '../ProjectService'
import type { Project } from '../types'

interface Props {
  onCreated: (project: Project) => void
  onClose:   () => void
}

const svc = new ProjectService()

export function ProjectCreateModal({ onCreated, onClose }: Props) {
  const [name,    setName]    = useState('')
  const [vision,  setVision]  = useState('')
  const [status,  setStatus]  = useState('Planning')
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const submit = async () => {
    const n = name.trim()
    const v = vision.trim()
    if (!n || !v) { setError('Name and description are required.'); return }
    setBusy(true)
    setError(null)
    try {
      const project = await svc.createProject(n, v, status.trim() || 'Planning')
      onCreated(project)
    } catch (err) {
      setError(String(err))
      setBusy(false)
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onKeyDown={onKey}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="
        w-full max-w-md mx-4
        rounded-2xl border border-white/12 bg-[#0e0e0e]
        px-6 py-5 flex flex-col gap-4
        shadow-2xl
      ">
        <h2 className="text-sm font-medium text-white/80">New Project</h2>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/30">Name</span>
          <input
            ref={nameRef}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="OAuth Migration"
            className="
              w-full rounded-lg border border-white/10 bg-white/5
              px-3 py-2 text-sm text-white/90 placeholder:text-white/20
              focus:outline-none focus:border-white/25
              transition-colors
            "
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/30">Description / Vision</span>
          <textarea
            value={vision}
            onChange={e => setVision(e.target.value)}
            placeholder="What this project is trying to achieve…"
            rows={3}
            className="
              w-full rounded-lg border border-white/10 bg-white/5
              px-3 py-2 text-sm text-white/90 placeholder:text-white/20
              focus:outline-none focus:border-white/25
              resize-none transition-colors
            "
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/30">Current Status</span>
          <input
            value={status}
            onChange={e => setStatus(e.target.value)}
            placeholder="Planning"
            className="
              w-full rounded-lg border border-white/10 bg-white/5
              px-3 py-2 text-sm text-white/90 placeholder:text-white/20
              focus:outline-none focus:border-white/25
              transition-colors
            "
          />
        </label>

        {error && (
          <p className="text-xs text-cyan-400/80">{error}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => void submit()}
            disabled={busy || !name.trim() || !vision.trim()}
            className="
              flex-1 rounded-lg bg-white/10 hover:bg-white/15
              py-2 text-xs font-medium text-white/80 hover:text-white/95
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors
            "
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
          <button
            onClick={onClose}
            disabled={busy}
            className="
              px-4 rounded-lg border border-white/10 hover:border-white/20
              py-2 text-xs text-white/40 hover:text-white/60
              transition-colors
            "
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
