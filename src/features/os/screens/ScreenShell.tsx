import type { ReactNode } from 'react'

// Shared layout for every non-dashboard OS surface: a header + content,
// matching the Dashboard's width, padding and type scale.
export function ScreenShell({ title, subtitle, action, children }: {
  title:     string
  subtitle?: string
  action?:   ReactNode
  children:  ReactNode
}) {
  return (
    <div className="px-8 py-7 pb-28 max-w-[1500px] mx-auto">
      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white/95">{title}</h1>
          {subtitle && <p className="text-white/45 mt-1 text-sm">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

export type BuildState = 'built' | 'active' | 'planned'

// The UI doubles as the spec: this strip says, in plain sight, what code
// already powers a screen vs. what still has to be built behind it.
export function BuildStatus({ items }: { items: { label: string; state: BuildState }[] }) {
  const tone: Record<BuildState, string> = {
    built:   'text-cyan-300/80 bg-cyan-500/10 border-cyan-400/20',
    active:  'text-cyan-200 bg-cyan-500/12 border-cyan-400/25',
    planned: 'text-cyan-200/75 bg-cyan-400/[0.07] border-cyan-300/20',
  }
  const dot: Record<BuildState, string> = { built: '✓ built', active: '◆ active', planned: '○ to build' }
  return (
    <div className="mt-6 rounded-2xl bg-white/[0.02] border border-white/8 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-white/35 mb-2">Build status — what powers this screen</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map(it => (
          <span key={it.label} className={`text-[11px] px-2 py-1 rounded-lg border ${tone[it.state]}`}>
            <span className="mr-1.5 opacity-60 text-[9px] uppercase tracking-wide">{dot[it.state]}</span>{it.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// A small empty/placeholder block for surfaces whose data isn't wired yet.
export function Hint({ children }: { children: ReactNode }) {
  return <div className="text-xs text-white/35 leading-relaxed">{children}</div>
}
