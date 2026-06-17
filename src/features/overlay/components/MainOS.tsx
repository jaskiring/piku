import { useState } from 'react'
import type { Message, PresenceState } from '../../../types'
import { StatusBar }        from './StatusBar'
import { NeuralBackground } from './NeuralBackground'
import { GraphCanvas }      from '../../graph/components/GraphCanvas'
import { ChatHistory }      from '../../chat/components/ChatHistory'
import { ChatInput }        from '../../chat/components/ChatInput'
import { ProjectsPanel }    from '../../projects/components/ProjectsPanel'
import { MemoriesPanel }    from '../../memory/components/MemoriesPanel'

// The full-screen Piku OS "home" (canvas-first, premium). Layers, back to front:
// neural-network backdrop → World-Model graph → rail/panels → status + chat dock.
// See [[09 — UI Spec]].

interface Props {
  presenceState: PresenceState
  chatHistory:   Message[]
  inputText:     string
  isSending:     boolean
  onInputChange: (text: string) => void
  onSend:        (text: string) => void
}

const PRESENCE: Record<PresenceState, { dot: string; glow: string; pulse: boolean }> = {
  idle:      { dot: 'bg-cyan-400',  glow: 'shadow-[0_0_14px_3px_rgba(34,211,238,0.45)]', pulse: false },
  listening: { dot: 'bg-cyan-300',   glow: 'shadow-[0_0_18px_4px_rgba(125,211,252,0.6)]', pulse: false },
  thinking:  { dot: 'bg-cyan-300',  glow: 'shadow-[0_0_18px_4px_rgba(56,189,248,0.6)]',  pulse: true  },
}

type PanelKey = 'projects' | 'vault' | 'sources' | 'memories'

const RAIL: { key: PanelKey; glyph: string; label: string; desc: string }[] = [
  { key: 'projects', glyph: '◈', label: 'Projects',  desc: 'Goals, decisions, and progress Piku tracks per project — drawn from the World Model.' },
  { key: 'vault',    glyph: '▦', label: 'Vault',     desc: "Piku's runtime memory vault — brainstorms, session notes, and the World-Model export (Sprint 2.5-V)." },
  { key: 'sources',  glyph: '⬡', label: 'Sources',   desc: 'Observation sources Piku watches — IDE, browser, documents, calendar (the observation loop, Phase 3+).' },
  { key: 'memories', glyph: '✦', label: 'Memories',  desc: 'Facts Piku remembers about you, with provenance — the memories store.' },
]

export function MainOS({ presenceState, chatHistory, inputText, isSending, onInputChange, onSend }: Props) {
  const [panel, setPanel] = useState<PanelKey | null>(() => {
    try {
      const v = new URLSearchParams(window.location.search).get('panel')
      if (v === 'projects' || v === 'vault' || v === 'sources' || v === 'memories') return v
    } catch { /* not in a browser */ }
    return null
  })
  const active = RAIL.find(r => r.key === panel)
  const p = PRESENCE[presenceState]

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#02040A] text-white antialiased">
      {/* depth wash */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_30%,rgba(20,32,58,0.55),transparent_70%)]" />

      {/* L0 — animated neural-network backdrop */}
      <NeuralBackground />

      {/* L1 — the World-Model graph (the content) */}
      <GraphCanvas />

      {/* subtle top/bottom vignette so the chrome reads cleanly */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/50 to-transparent pointer-events-none z-[5]" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/60 to-transparent pointer-events-none z-[5]" />

      {/* Left rail */}
      <div className="absolute left-0 top-0 bottom-0 w-16 flex flex-col items-center gap-1.5 pt-16 pb-6 z-10">
        <RailButton glyph="✺" label="Graph" activeState={panel === null} onClick={() => setPanel(null)} />
        <div className="h-px w-6 bg-white/10 my-1.5" />
        {RAIL.map(r => (
          <RailButton key={r.key} glyph={r.glyph} label={r.label}
            activeState={panel === r.key}
            onClick={() => setPanel(prev => (prev === r.key ? null : r.key))} />
        ))}
      </div>

      {/* Slide-in panel */}
      {active && (
        <div className="absolute left-16 top-16 bottom-28 w-72 z-10 rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.02] backdrop-blur-2xl border border-white/10 ring-1 ring-inset ring-white/[0.04] p-4 shadow-[0_16px_60px_-12px_rgba(0,0,0,0.85)] flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-white/85 flex items-center gap-2">
              <span className="text-cyan-300/70">{active.glyph}</span>{active.label}
            </span>
            <button onClick={() => setPanel(null)} className="text-white/30 hover:text-white/70 text-xs leading-none">✕</button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {active.key === 'projects' ? <ProjectsPanel />
              : active.key === 'memories' ? <MemoriesPanel />
              : (
                <>
                  <p className="text-xs text-white/45 leading-relaxed">{active.desc}</p>
                  <div className="mt-4 rounded-xl border border-dashed border-white/8 py-10 flex items-center justify-center">
                    <span className="text-[11px] text-white/20">not built yet — arrives in a later sprint</span>
                  </div>
                </>
              )}
          </div>
        </div>
      )}

      {/* Top status strip */}
      <div className="absolute top-0 left-0 right-0 px-6 py-4 pointer-events-none z-20">
        <div className="pointer-events-auto">
          <StatusBar presenceState={presenceState} />
        </div>
      </div>

      {/* hint */}
      <div className="absolute bottom-5 left-20 text-[10px] text-white/25 select-none pointer-events-none z-10 tracking-wide">
        drag to pan · scroll to zoom · click a node
      </div>

      {/* Floating chat dock */}
      <div className="absolute bottom-7 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 flex flex-col gap-2.5 z-20">
        {chatHistory.length > 0 && (
          <div className="max-h-80 overflow-y-auto rounded-3xl bg-gradient-to-b from-white/[0.06] to-white/[0.015] backdrop-blur-2xl border border-white/10 ring-1 ring-inset ring-white/[0.04] px-4 py-3.5 shadow-[0_16px_60px_-12px_rgba(0,0,0,0.85)]">
            <ChatHistory messages={chatHistory} />
          </div>
        )}
        <div className="relative flex items-center gap-3 rounded-3xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] backdrop-blur-2xl border border-white/12 ring-1 ring-inset ring-white/[0.05] pl-4 pr-3 py-2.5 shadow-[0_18px_70px_-14px_rgba(0,0,0,0.9),0_0_50px_-20px_rgba(34,211,238,0.5)]">
          <span className="absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <span className="relative flex shrink-0 w-9 h-9 items-center justify-center">
            {p.pulse && <span className={`absolute w-9 h-9 rounded-full ${p.dot} opacity-20 animate-ping`} />}
            <span className={`absolute w-6 h-6 rounded-full ${p.dot} opacity-15 blur-md`} />
            <span className={`w-3 h-3 rounded-full ${p.dot} ${p.glow}`} />
          </span>
          <div className="flex-1">
            <ChatInput
              value={inputText}
              isLoading={isSending}
              onChange={onInputChange}
              onSend={() => onSend(inputText)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function RailButton({ glyph, label, activeState, onClick }: { glyph: string; label: string; activeState: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} title={label}
      className={`
        w-11 h-11 rounded-2xl flex items-center justify-center text-lg
        border backdrop-blur-md transition-all duration-200
        ${activeState
          ? 'text-cyan-200 border-cyan-400/30 bg-cyan-500/15 shadow-[0_0_20px_-4px_rgba(34,211,238,0.6)]'
          : 'text-white/35 hover:text-white/80 border-white/5 hover:border-white/12 bg-white/[0.02] hover:bg-white/[0.06]'}
      `}>
      {glyph}
    </button>
  )
}
