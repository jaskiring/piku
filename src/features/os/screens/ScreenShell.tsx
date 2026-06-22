import type { ReactNode } from 'react'
import { chamfer } from '../Hud'

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
  const dot: Record<BuildState, string> = { built: '✓', active: '◆', planned: '○' }
  return (
    <div className="mt-6 px-4 py-3.5"
      style={{ ...chamfer(10), background: 'rgba(255,255,255,0.02)', boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.18)' }}>
      <div className="font-hud text-[10px] uppercase tracking-[0.22em] text-cyan-300/55 mb-2.5">Build status — what powers this screen</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map(it => (
          <span key={it.label} className={`font-hud text-[9.5px] px-2.5 py-1 tracking-[0.12em] uppercase border ${tone[it.state]}`}
            style={{ ...chamfer(6) }}>
            <span className="mr-1.5 opacity-60 text-[8px]">{dot[it.state]}</span>{it.label}
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
