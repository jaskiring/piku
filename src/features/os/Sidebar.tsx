import { ACTIVE_BRAIN } from '../../services/OllamaService'

export type NavKey =
  | 'home' | 'agent' | 'models' | 'projects' | 'knowledge' | 'datasets'
  | 'apps' | 'files' | 'calendar' | 'people' | 'settings'

const ITEMS: { key: NavKey; label: string; glyph: string }[] = [
  { key: 'home',      label: 'Home',      glyph: '⌂' },
  { key: 'agent',     label: 'Agent',     glyph: '◇' },
  { key: 'models',    label: 'Models',    glyph: '◈' },
  { key: 'projects',  label: 'Projects',  glyph: '▤' },
  { key: 'knowledge', label: 'Knowledge', glyph: '✦' },
  { key: 'datasets',  label: 'Datasets',  glyph: '≣' },
  { key: 'apps',      label: 'Apps',      glyph: '⊞' },
  { key: 'files',     label: 'Files',     glyph: '▭' },
  { key: 'calendar',  label: 'Calendar',  glyph: '◷' },
  { key: 'people',    label: 'People',    glyph: '◍' },
  { key: 'settings',  label: 'Settings',  glyph: '⚙' },
]

const NOTCH = 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))'

export function Sidebar({ view, onNavigate }: { view: NavKey; onNavigate: (k: NavKey) => void }) {
  return (
    <aside className="relative z-20 w-60 shrink-0 h-full flex flex-col bg-black/40 backdrop-blur-2xl px-3.5 py-5">
      {/* neon right edge + faint grid */}
      <div className="absolute top-0 right-0 w-px h-full bg-gradient-to-b from-transparent via-cyan-400/40 to-transparent" />
      <div className="absolute inset-0 cyber-grid opacity-20 pointer-events-none" />

      {/* wordmark */}
      <div className="relative flex items-center gap-2.5 px-1.5 mb-8">
        <span className="text-cyan-300 text-lg text-glow-cyan">◆</span>
        <div className="leading-none">
          <div className="text-[15px] font-semibold tracking-[0.2em] text-white/90">PIKU</div>
          <div className="font-hud text-[8.5px] tracking-[0.3em] text-cyan-300/45 mt-1">// AMBIENT OS</div>
        </div>
      </div>

      <nav className="relative flex flex-col gap-0.5 flex-1">
        {ITEMS.map((it, i) => {
          const active = view === it.key
          return (
            <button key={it.key} onClick={() => onNavigate(it.key)}
              className={`relative group flex items-center gap-3 px-3 py-2 text-[13px] transition-colors
                ${active ? 'text-cyan-100' : 'text-white/45 hover:text-white/85'}`}>
              {active && <>
                <span className="absolute inset-0 bg-cyan-500/10" style={{ clipPath: NOTCH }} />
                <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
              </>}
              <span className={`relative w-4 text-center text-[13px] ${active ? 'text-cyan-300 text-glow-cyan' : 'text-white/35 group-hover:text-white/60'}`}>{it.glyph}</span>
              <span className="relative flex-1">{it.label}</span>
              <span className={`relative font-hud text-[9px] tracking-wider ${active ? 'text-cyan-300/60' : 'text-white/20'}`}>{String(i + 1).padStart(2, '0')}</span>
            </button>
          )
        })}
      </nav>

      {/* system status footer */}
      <div className="relative mt-3 px-3 py-3 bg-white/[0.02]"
        style={{ clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))', boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.18)' }}>
        <div className="flex items-center gap-2">
          <span className="relative flex w-2 h-2">
            <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400/60 animate-ping" />
            <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-400" />
          </span>
          <span className="font-hud text-[9.5px] tracking-[0.18em] text-emerald-300/80 uppercase">System Online</span>
        </div>
        <div className="font-hud text-[9px] text-white/35 mt-2 leading-relaxed">
          <div>BRAIN · {ACTIVE_BRAIN.model}</div>
          <div className="text-white/25">LOCAL · PRIVATE · ON-DEVICE</div>
        </div>
      </div>
    </aside>
  )
}
