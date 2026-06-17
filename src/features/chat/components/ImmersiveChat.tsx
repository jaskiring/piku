import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Message, PresenceState } from '../../../types'
import { NeuralBackground } from '../../overlay/components/NeuralBackground'
import { Orb } from '../../orb'
import { ChatInput } from './ChatInput'

interface Props {
  presence:          PresenceState
  messages:          Message[]
  inputText:         string
  isSending:         boolean
  onInputChange:     (t: string) => void
  onSend:            () => void
  onClose:           () => void
  voiceOn:           boolean
  onToggleVoice:     () => void
  listening:         boolean
  onToggleListening: () => void
  sttSupported:      boolean
  speaking:          boolean
}

// The immersive conversation surface. Full-screen, calm, orb-focal — you're talking to a
// presence, not poking a chat sidebar. The OS recedes (dimmed neural field behind); Esc returns.
export function ImmersiveChat({ presence, messages, inputText, isSending, onInputChange, onSend, onClose, voiceOn, onToggleVoice, listening, onToggleListening, sttSupported, speaking }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const endRef    = useRef<HTMLDivElement>(null)

  // Esc closes the conversation and returns to the OS.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Follow the conversation — auto-scroll to the latest, including during streaming.
  const lastText = messages.length ? messages[messages.length - 1].text : ''
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, lastText])

  const empty = messages.length === 0

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col bg-[#03060D]/85 backdrop-blur-2xl"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* dim ambient field + vignette */}
      <div className="absolute inset-0 opacity-40 pointer-events-none"><NeuralBackground /></div>
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,rgba(12,40,60,0.45),transparent_70%)] pointer-events-none" />

      {/* header */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2.5">
          <Orb presence={presence} size={40} />
          <div className="leading-tight">
            <div className="text-sm font-medium text-white/85">Piku</div>
            <div className="text-[11px] text-cyan-300/60">{speaking ? 'speaking…' : statusLabel(presence)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onToggleVoice} title={voiceOn ? 'Voice on — Piku speaks replies' : 'Voice off'}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 h-8 text-[11px] transition-colors ${voiceOn ? 'border-cyan-400/40 text-cyan-200 bg-cyan-500/10' : 'border-white/10 text-white/40 hover:text-white/70'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${voiceOn ? 'bg-cyan-300' : 'bg-white/30'} ${speaking ? 'animate-pulse' : ''}`} />
            {speaking ? 'speaking' : 'voice'}
          </button>
          <button onClick={onClose}
            className="flex items-center gap-2 text-white/35 hover:text-white/75 transition-colors text-xs">
            <span className="hidden sm:inline">esc</span>
            <span className="w-7 h-7 rounded-full border border-white/10 flex items-center justify-center">✕</span>
          </button>
        </div>
      </div>

      {/* conversation */}
      <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto">
        {empty ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 -mt-10">
            <Orb presence={presence} size={200} />
            <h2 className="mt-6 text-2xl font-semibold tracking-tight text-white/90">What's on your mind?</h2>
            <p className="mt-1.5 text-white/40 text-sm">Piku is listening — and remembers across conversations.</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto w-full px-6 py-6 flex flex-col gap-6">
            <AnimatePresence initial={false}>
              {messages.map(m => <Bubble key={m.id} message={m} />)}
            </AnimatePresence>
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* input */}
      <div className="relative z-10 px-6 pb-7 pt-2">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] backdrop-blur-2xl border border-white/12 ring-1 ring-inset ring-white/5 pl-4 pr-2.5 py-2.5 shadow-[0_18px_70px_-14px_rgba(0,0,0,0.9),0_0_60px_-22px_rgba(34,211,238,0.5)]">
            <span className="text-cyan-300 text-lg">✦</span>
            <div className="flex-1">
              <ChatInput value={inputText} isLoading={isSending} onChange={onInputChange} onSend={onSend} />
            </div>
            {sttSupported && (
              <button onClick={onToggleListening} title={listening ? 'Stop' : 'Speak to Piku'}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${listening ? 'bg-cyan-500/30 text-cyan-100 animate-pulse' : 'text-white/40 hover:text-white/80 hover:bg-white/5'}`}>◉</button>
            )}
            <button onClick={() => { if (inputText.trim() && !isSending) onSend() }}
              disabled={!inputText.trim() || isSending}
              className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-200 flex items-center justify-center hover:bg-cyan-500/30 disabled:opacity-40 transition-colors">≋</button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function statusLabel(p: PresenceState): string {
  return p === 'thinking' ? 'thinking…' : p === 'listening' ? 'listening' : 'here with you'
}

// ── A single turn ────────────────────────────────────────────────────────────
function Bubble({ message }: { message: Message }) {
  const isUser   = message.sender === 'user'
  const thinking = (!isUser && message.thinking?.trim()) || ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`max-w-[82%] ${isUser ? '' : 'flex gap-3'}`}>
        {!isUser && (
          <span className="mt-1 w-6 h-6 shrink-0 rounded-full bg-cyan-400/15 border border-cyan-400/25 flex items-center justify-center text-cyan-300 text-xs">✦</span>
        )}
        <div className="min-w-0">
          {thinking && <Thinking text={thinking} />}
          {isUser ? (
            <div className="rounded-2xl rounded-br-md bg-cyan-500/12 border border-cyan-400/15 px-4 py-2.5 text-[15px] leading-relaxed text-cyan-50/95">
              {message.text}
            </div>
          ) : (
            <div className="text-[15px] leading-relaxed text-white/85 whitespace-pre-wrap pt-0.5">
              {message.text || <span className="text-white/30">…</span>}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// Visible by default — watching Piku reason live is a core product value (see the GDD:
// live thinking is a deliberate identity feature, not noise). User can collapse it if they want.
function Thinking({ text }: { text: string }) {
  return (
    <details open className="mb-2 group">
      <summary className="text-[11px] text-cyan-300/55 hover:text-cyan-300/85 cursor-pointer select-none list-none flex items-center gap-1.5">
        <span className="w-1 h-1 rounded-full bg-cyan-300/70 animate-pulse" />
        <span className="group-open:hidden">▸ thinking</span>
        <span className="hidden group-open:inline">▾ thinking</span>
      </summary>
      <div className="mt-1.5 border-l-2 border-cyan-400/25 pl-3 text-[12.5px] leading-relaxed text-cyan-100/45 italic whitespace-pre-wrap">
        {text}
      </div>
    </details>
  )
}

