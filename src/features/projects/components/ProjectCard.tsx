import type { Project } from '../types'

interface Props {
  project:         Project
  onUpdateContext?: () => void
}

export function ProjectCard({ project, onUpdateContext }: Props) {
  const since = formatAge(project.updatedAt)

  return (
    <div className="
      rounded-xl border border-white/8 bg-white/3
      px-4 py-3 flex flex-col gap-2
    ">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-white/90 leading-snug">{project.name}</h3>
        <span className="text-[10px] text-white/25 shrink-0 pt-0.5">{since}</span>
      </div>

      {/* Vision */}
      <p className="text-xs text-white/45 italic leading-relaxed line-clamp-2">
        {project.vision}
      </p>

      {/* Status */}
      {project.currentState && (
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/60 shrink-0" />
          <span className="text-xs text-white/60">{project.currentState}</span>
        </div>
      )}

      {/* Next steps */}
      {project.nextSteps.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-white/30 uppercase tracking-wider">Next</span>
          {project.nextSteps.slice(0, 3).map((step, i) => (
            <span key={i} className="text-xs text-white/55 pl-2 before:content-['›'] before:mr-1.5 before:text-white/25">
              {step}
            </span>
          ))}
        </div>
      )}

      {/* Blockers */}
      {project.blockers.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-cyan-400/50 uppercase tracking-wider">Blocked</span>
          {project.blockers.slice(0, 2).map((b, i) => (
            <span key={i} className="text-xs text-cyan-300/50 pl-2 before:content-['!'] before:mr-1.5 before:text-cyan-400/40">
              {b}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-0.5 border-t border-white/5">
        <div className="flex gap-3">
          {project.completedWork.length > 0 && (
            <span className="text-[10px] text-white/30">
              ✓ {project.completedWork.length} done
            </span>
          )}
          {project.decisions.length > 0 && (
            <span className="text-[10px] text-white/30">
              {project.decisions.length} decision{project.decisions.length !== 1 ? 's' : ''}
            </span>
          )}
          {project.research.length > 0 && (
            <span className="text-[10px] text-white/30">
              {project.research.length} research item{project.research.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {onUpdateContext && (
          <button
            onClick={onUpdateContext}
            className="
              text-[10px] text-white/25 hover:text-white/55
              border border-white/8 hover:border-white/18
              rounded px-2 py-0.5
              transition-colors
            "
          >
            + update context
          </button>
        )}
      </div>
    </div>
  )
}

function formatAge(ts: number): string {
  const ms   = Date.now() - ts
  const mins = Math.floor(ms / 60_000)
  if (mins < 1)    return 'just now'
  if (mins < 60)   return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)    return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30)   return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}
