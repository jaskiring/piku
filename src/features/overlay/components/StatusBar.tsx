import type { PresenceState } from '../../../types'
import { ACTIVE_BRAIN }       from '../../../services/OllamaService'

// Ghosted top strip (honors the "calm, peripheral, no-HUD" visual identity).
// Surfaces two features at a glance: Piku's presence, and the active "brain"
// (which model/provider is answering). The brain becomes dynamic with the
// ProviderRegistry (Sprint 2.5-P: local Ollama vs Claude-CLI escalation).
const PRESENCE: Record<PresenceState, { label: string; dot: string }> = {
  idle:      { label: 'idle',      dot: 'bg-cyan-400/40' },
  listening: { label: 'listening', dot: 'bg-cyan-400/80' },
  thinking:  { label: 'thinking…', dot: 'bg-cyan-400/70 animate-pulse' },
}

export function StatusBar({ presenceState }: { presenceState: PresenceState }) {
  const p = PRESENCE[presenceState]
  return (
    <div className="w-full flex items-center justify-between px-1 text-[10px] text-white/30 select-none tracking-wide">
      <span className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
        <span className="text-white/50">Piku</span>
        <span className="text-white/15">·</span>
        <span>{p.label}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-white/20">brain</span>
        <span className="text-white/45">{ACTIVE_BRAIN.model}</span>
        <span className="text-white/15">·</span>
        <span className="text-cyan-300/45">{ACTIVE_BRAIN.where}</span>
      </span>
    </div>
  )
}
