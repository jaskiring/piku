import type { ReactNode, CSSProperties } from 'react'

// Shared cyberpunk-HUD primitives. The signature look: a chamfered (angular-clipped) silhouette,
// a hairline neon edge that follows the chamfer, corner-bracket ticks, and a soft outer bloom.
// Restraint is the whole game — neon is an accent on a near-black face, never a fill.

export type Accent = 'cyan' | 'violet' | 'amber'

const EDGE: Record<Accent, string> = {
  cyan:   'rgba(34,211,238,0.55)',
  violet: 'rgba(217,70,239,0.5)',
  amber:  'rgba(245,158,11,0.5)',
}
const GLOW: Record<Accent, string> = {
  cyan:   'rgba(34,211,238,0.22)',
  violet: 'rgba(217,70,239,0.2)',
  amber:  'rgba(245,158,11,0.18)',
}

// chamfer cuts the top-right + bottom-left corners; the square TL/BR carry the corner ticks.
export const chamfer = (size = 12): CSSProperties => ({
  clipPath: `polygon(0 0, calc(100% - ${size}px) 0, 100% ${size}px, 100% 100%, ${size}px 100%, 0 calc(100% - ${size}px))`,
})

export function CornerTicks({ accent = 'cyan' }: { accent?: Accent }) {
  const c = EDGE[accent]
  return (
    <>
      <span className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l pointer-events-none" style={{ borderColor: c }} />
      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r pointer-events-none" style={{ borderColor: c }} />
    </>
  )
}

// A chamfered glass panel with a crisp neon edge (rendered as a 1px reveal of an edge layer
// beneath the face, so the diagonal cut keeps its line — a plain border would clip away there).
export function HudPanel({ label, code, action, children, className = '', accent = 'cyan', size = 13 }: {
  label?: string
  code?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  accent?: Accent
  size?: number
}) {
  const edge = EDGE[accent]
  return (
    <div className={`group relative ${className}`} style={{ filter: `drop-shadow(0 14px 34px ${GLOW[accent].replace(/[\d.]+\)$/, '0.16)')})` }}>
      {/* neon edge layer */}
      <div className="absolute inset-0 transition-opacity" style={{ ...chamfer(size), background: `linear-gradient(160deg, ${edge}, rgba(120,160,210,0.12) 45%, rgba(255,255,255,0.04))` }} />
      {/* dark glass face, inset 1px to reveal the edge as a hairline frame */}
      <div className="absolute inset-[1.1px] bg-gradient-to-b from-[#0a1120]/85 to-[#070b14]/80 backdrop-blur-xl" style={chamfer(size - 1)} />
      {/* hover bloom */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{ ...chamfer(size), boxShadow: `inset 0 0 26px -6px ${GLOW[accent]}` }} />

      <div className="relative p-4">
        {(label || action) && (
          <div className="flex items-center justify-between mb-3">
            <span className="font-hud text-[10px] uppercase tracking-[0.2em] text-white/45 flex items-center gap-2">
              <span className="w-1.5 h-1.5 shrink-0" style={{ background: edge, boxShadow: `0 0 7px ${edge}` }} />
              {label}{code && <span className="text-white/25 ml-0.5">// {code}</span>}
            </span>
            {action}
          </div>
        )}
        {children}
      </div>
      <CornerTicks accent={accent} />
    </div>
  )
}

// A small mono pill used for status/readouts in the HUD.
export function HudChip({ children, accent = 'cyan', dim = false }: { children: ReactNode; accent?: Accent; dim?: boolean }) {
  const c = EDGE[accent]
  return (
    <span className="font-hud inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] tracking-[0.12em] uppercase text-white/55"
      style={{ ...chamfer(6), background: 'rgba(255,255,255,0.03)', boxShadow: `inset 0 0 0 1px ${dim ? 'rgba(255,255,255,0.06)' : c.replace(/[\d.]+\)$/, '0.28)')}` }}>
      {children}
    </span>
  )
}
