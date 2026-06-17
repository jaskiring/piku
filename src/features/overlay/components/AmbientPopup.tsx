import { useState, useCallback } from 'react'
import { ChatInput } from '../../chat/components/ChatInput'

// The ambient hotkey surface (the `orb` window). Transparent, always-on-top,
// dropped at the bottom of the active screen by ⌥+Space — a premium command bar
// to talk to Piku or run a quick action over whatever app you're in.
// Real action wiring comes after the UI; this specifies the surface.

const QUICK = ['Summarize this page', 'Save to Piku', 'What am I working on?', 'Open Piku OS']

function dismiss() {
  try {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      void import('@tauri-apps/api/core').then(m => m.invoke('hide_overlay')).catch(() => {})
    }
  } catch { /* not in Tauri */ }
}

export function AmbientPopup() {
  const [text, setText] = useState('')
  const [echo, setEcho] = useState<string | null>(null)

  const onSend = useCallback(() => {
    const t = text.trim()
    if (!t) return
    setEcho(t)
    setText('')
  }, [text])

  return (
    <div
      className="w-screen h-screen bg-transparent flex items-end justify-center p-4"
      onKeyDown={(e) => { if (e.key === 'Escape') dismiss() }}
    >
      <div className="w-full max-w-2xl flex flex-col gap-2">
        {echo && (
          <div className="self-stretch rounded-2xl bg-gradient-to-b from-white/[0.06] to-white/[0.015] backdrop-blur-2xl border border-white/10 px-4 py-2.5 shadow-[0_16px_60px_-12px_rgba(0,0,0,0.85)]">
            <div className="text-[11px] text-white/35 mb-0.5">you · {echo}</div>
            <div className="text-sm text-white/70">Piku: <span className="text-white/45 italic">on it — quick actions wire up next.</span></div>
          </div>
        )}

        <div className="relative flex items-center gap-3 rounded-3xl bg-gradient-to-b from-white/[0.09] to-white/[0.03] backdrop-blur-2xl border border-white/12 ring-1 ring-inset ring-white/[0.05] pl-4 pr-3 py-2.5 shadow-[0_18px_70px_-14px_rgba(0,0,0,0.92),0_0_50px_-18px_rgba(34,211,238,0.55)]">
          <span className="absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <span className="relative flex shrink-0 w-9 h-9 items-center justify-center">
            <span className="absolute w-6 h-6 rounded-full bg-cyan-400 opacity-15 blur-md" />
            <span className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_16px_3px_rgba(34,211,238,0.55)]" />
          </span>
          <div className="flex-1">
            <ChatInput value={text} isLoading={false} onChange={setText} onSend={onSend} />
          </div>
          <button onClick={dismiss} className="text-white/25 hover:text-white/55 text-[11px] px-2 shrink-0">esc</button>
        </div>

        <div className="flex flex-wrap gap-1.5 px-1">
          {QUICK.map(q => (
            <button key={q} onClick={() => setText(q)}
              className="text-[11px] text-white/45 hover:text-white/85 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-full px-2.5 py-1 transition-colors backdrop-blur-md">
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
