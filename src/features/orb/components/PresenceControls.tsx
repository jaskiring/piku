// TEMPORARY — dev-only controls for switching presence state manually.
// Remove (or hide behind a dev flag) when IPC + hotkey are wired up.

import type { PresenceState } from '../../../types'

interface Props {
  state: PresenceState
  onChange: (state: PresenceState) => void
}

const STATES: { key: PresenceState; label: string }[] = [
  { key: 'idle',      label: 'Idle'      },
  { key: 'listening', label: 'Listening' },
  { key: 'thinking',  label: 'Thinking'  },
]

export function PresenceControls({ state, onChange }: Props) {
  return (
    <div className="absolute bottom-8 flex items-center gap-2">
      {STATES.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={[
            'px-4 py-1.5 rounded-full text-[10px] tracking-[0.2em] uppercase',
            'border transition-all duration-300 cursor-pointer',
            state === key
              ? 'bg-cyan-500/15 text-cyan-300/80 border-cyan-500/30'
              : 'bg-transparent text-white/20 border-white/8 hover:text-white/40 hover:border-white/16',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
