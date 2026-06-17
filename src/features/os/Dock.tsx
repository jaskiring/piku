import type { NavKey } from './Sidebar'

const DOCK: { key: NavKey; label: string; glyph: string }[] = [
  { key: 'home',      label: 'Home',      glyph: '⌂' },
  { key: 'models',    label: 'Models',    glyph: '◈' },
  { key: 'projects',  label: 'Projects',  glyph: '▤' },
  { key: 'knowledge', label: 'Knowledge', glyph: '✦' },
  { key: 'apps',      label: 'Apps',      glyph: '⊞' },
  { key: 'settings',  label: 'Settings',  glyph: '⚙' },
]

const NOTCH = 'polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 11px 100%, 0 calc(100% - 11px))'
const NOTCH_SM = 'polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 7px 100%, 0 calc(100% - 7px))'

export function Dock({ view, onNavigate }: { view: NavKey; onNavigate: (k: NavKey) => void }) {
  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30">
      {/* neon edge frame via 1px reveal */}
      <div className="absolute inset-0" style={{ clipPath: NOTCH, background: 'linear-gradient(160deg,rgba(34,211,238,0.4),rgba(120,160,210,0.1))' }} />
      <div className="relative flex items-center gap-0.5 bg-[#070b14]/85 backdrop-blur-2xl px-2 py-1.5 m-[1px]"
        style={{ clipPath: NOTCH }}>
        {DOCK.map(it => {
          const active = view === it.key
          return (
            <button key={it.key} onClick={() => onNavigate(it.key)} title={it.label}
              className={`relative flex flex-col items-center gap-0.5 px-3.5 py-1.5 transition-colors
                ${active ? 'text-cyan-200' : 'text-white/45 hover:text-white/80'}`}>
              {active && <span className="absolute inset-0 bg-cyan-500/15" style={{ clipPath: NOTCH_SM }} />}
              <span className={`relative text-base leading-none ${active ? 'text-glow-cyan' : ''}`}>{it.glyph}</span>
              <span className="relative font-hud text-[8px] tracking-[0.12em] uppercase">{it.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
