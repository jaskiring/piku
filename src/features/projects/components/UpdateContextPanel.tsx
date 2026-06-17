import { useState } from 'react'
import { ProjectUpdateService } from '../ProjectUpdateService'
import { documentAbsorptionService } from '../DocumentAbsorptionService'
import type { Project, ReviewableDiff } from '../types'

interface Props {
  project:   Project
  onUpdated: (project: Project) => void
  onClose:   () => void
}

type Phase = 'input' | 'extracting' | 'review' | 'applying'

const svc = new ProjectUpdateService()

export function UpdateContextPanel({ project, onUpdated, onClose }: Props) {
  const [phase,   setPhase]   = useState<Phase>('input')
  const [content, setContent] = useState('')
  const [diff,    setDiff]    = useState<ReviewableDiff | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  const extract = async () => {
    if (!content.trim()) return
    setPhase('extracting')
    setError(null)
    try {
      const result = await svc.previewContextUpdate(project.id, content)
      if (!result) {
        setError('Nothing project-relevant was found in that content. Try pasting more specific notes or decisions.')
        setPhase('input')
        return
      }
      setDiff(result)
      setPhase('review')
    } catch (err) {
      setError(`Extraction failed: ${String(err)}`)
      setPhase('input')
    }
  }

  const approve = async () => {
    if (!diff) return
    setPhase('applying')
    setError(null)
    try {
      const updated = await svc.applyApprovedDiff(project.id, diff)
      if (!updated) {
        setError('Failed to apply update. Try again.')
        setPhase('review')
        return
      }
      onUpdated(updated)
    } catch (err) {
      setError(`Apply failed: ${String(err)}`)
      setPhase('review')
    }
  }

  const pickFile = async () => {
    const result = await documentAbsorptionService.pickAndRead()
    if (result) setContent(result.content)
  }

  const reset = () => {
    setPhase('input')
    setDiff(null)
    setError(null)
  }

  return (
    <div className="
      rounded-xl border border-white/12 bg-white/3
      px-4 py-3 flex flex-col gap-3
    ">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-white/70">
          Update Context — <span className="text-white/40">{project.name}</span>
        </span>
        <button
          onClick={onClose}
          className="text-[10px] text-white/25 hover:text-white/50 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Input phase */}
      {(phase === 'input' || phase === 'extracting') && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/30">
              Paste content or select a file
            </span>
            <button
              onClick={() => void pickFile()}
              disabled={phase === 'extracting'}
              className="
                flex items-center gap-1 px-2 py-1
                rounded-md border border-white/10 hover:border-white/20
                text-[10px] text-white/40 hover:text-white/65
                disabled:opacity-30 disabled:cursor-not-allowed
                transition-colors
              "
            >
              Select File
            </button>
          </div>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            disabled={phase === 'extracting'}
            placeholder={"Paste notes, decisions, or an AI conversation export…\n\nExample:\n\"We decided to use OAuth 2.0 with PKCE. JWT refresh tokens remain. Token expiry will use a sliding window strategy.\""}
            rows={7}
            className="
              w-full rounded-lg border border-white/8 bg-black/20
              px-3 py-2 text-xs text-white/80 placeholder:text-white/20
              focus:outline-none focus:border-white/20
              resize-none transition-colors
            "
          />
          {error && <p className="text-[11px] text-cyan-400/80">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => void extract()}
              disabled={phase === 'extracting' || !content.trim()}
              className="
                flex-1 rounded-lg bg-white/8 hover:bg-white/12
                py-2 text-xs font-medium text-white/70 hover:text-white/90
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-colors
              "
            >
              {phase === 'extracting' ? 'Extracting…' : 'Extract Changes'}
            </button>
            <button
              onClick={onClose}
              disabled={phase === 'extracting'}
              className="
                px-3 rounded-lg border border-white/8 hover:border-white/15
                text-[11px] text-white/35 hover:text-white/55
                transition-colors
              "
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* Review phase */}
      {(phase === 'review' || phase === 'applying') && diff && (
        <>
          <DiffPreview diff={diff} />
          {error && <p className="text-[11px] text-cyan-400/80">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => void approve()}
              disabled={phase === 'applying'}
              className="
                flex-1 rounded-lg bg-white/10 hover:bg-white/15
                py-2 text-xs font-medium text-white/80 hover:text-white/95
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-colors
              "
            >
              {phase === 'applying' ? 'Saving…' : 'Approve & Save'}
            </button>
            <button
              onClick={reset}
              disabled={phase === 'applying'}
              className="
                px-3 rounded-lg border border-white/8 hover:border-white/15
                text-[11px] text-white/35 hover:text-white/55
                transition-colors
              "
            >
              Back
            </button>
            <button
              onClick={onClose}
              disabled={phase === 'applying'}
              className="
                px-3 rounded-lg border border-white/8 hover:border-white/15
                text-[11px] text-white/35 hover:text-white/55
                transition-colors
              "
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function DiffPreview({ diff }: { diff: ReviewableDiff }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] uppercase tracking-wider text-white/30">Proposed Changes</p>

      {diff.stateChange && (
        <DiffSection label="Status" color="blue">
          <span className="text-white/40 line-through">{diff.stateChange.from}</span>
          <span className="text-white/20 mx-1">→</span>
          <span className="text-white/75">{diff.stateChange.to}</span>
        </DiffSection>
      )}

      {diff.newDecisions.length > 0 && (
        <DiffSection label="Decisions" color="emerald">
          {diff.newDecisions.map((d, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <span className="text-white/75">{d.title}</span>
              {d.reasoning && (
                <span className="text-white/35 pl-2 text-[11px]">{d.reasoning}</span>
              )}
            </div>
          ))}
        </DiffSection>
      )}

      {diff.newCompletedWork.length > 0 && (
        <DiffSection label="Completed" color="green">
          {diff.newCompletedWork.map((w, i) => (
            <span key={i} className="text-white/65">{w}</span>
          ))}
        </DiffSection>
      )}

      {diff.newInProgressWork.length > 0 && (
        <DiffSection label="In Progress" color="blue">
          {diff.newInProgressWork.map((w, i) => (
            <span key={i} className="text-white/65">{w}</span>
          ))}
        </DiffSection>
      )}

      {diff.newNextSteps.length > 0 && (
        <DiffSection label="Next Steps" color="indigo">
          {diff.newNextSteps.map((s, i) => (
            <span key={i} className="text-white/65">{s}</span>
          ))}
        </DiffSection>
      )}

      {diff.newBlockers.length > 0 && (
        <DiffSection label="Blockers" color="amber">
          {diff.newBlockers.map((b, i) => (
            <span key={i} className="text-cyan-300/60">{b}</span>
          ))}
        </DiffSection>
      )}
    </div>
  )
}

type Color = 'blue' | 'green' | 'emerald' | 'indigo' | 'amber'

const dot: Record<Color, string> = {
  blue:    'bg-cyan-400/50',
  green:   'bg-green-400/50',
  emerald: 'bg-cyan-400/50',
  indigo:  'bg-indigo-400/50',
  amber:   'bg-cyan-400/50',
}

const label: Record<Color, string> = {
  blue:    'text-cyan-300/60',
  green:   'text-green-300/60',
  emerald: 'text-cyan-300/60',
  indigo:  'text-indigo-300/60',
  amber:   'text-cyan-300/60',
}

function DiffSection({
  children, label: lbl, color,
}: {
  children: React.ReactNode
  label:    string
  color:    Color
}) {
  return (
    <div className="
      rounded-lg border border-white/6 bg-white/2
      px-3 py-2 flex flex-col gap-1
    ">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot[color]}`} />
        <span className={`text-[10px] uppercase tracking-wider ${label[color]}`}>{lbl}</span>
      </div>
      <div className="flex flex-col gap-1 pl-3">
        {children}
      </div>
    </div>
  )
}
