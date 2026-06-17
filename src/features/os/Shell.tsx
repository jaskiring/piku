import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence }                     from 'framer-motion'
import { useAppState }                        from '../../hooks/useAppState'
import { useChat, useConversationPersistence } from '../chat'
import { PIKU_SYSTEM_PROMPT }                 from '../chat/hooks/useChat'
import { ollamaService }                      from '../../services/OllamaService'
import { voiceService }                       from '../../services/VoiceService'
import { usePresenceCycle }                   from '../orb'
import { Sidebar, type NavKey }               from './Sidebar'
import { Dock }                               from './Dock'
import { HomeOS }                             from './HomeOS'
import { CyberBackground }                    from './CyberBackground'
import { GraphCanvas }                        from '../graph/components/GraphCanvas'
import { SCREENS }                            from './screens/Screens'
import { ImmersiveChat }                      from '../chat/components/ImmersiveChat'
import { seedAccounts }                       from '../../services/accounts/init'

// The Piku OS shell: sidebar + view + dock over a neural field. The "Ask piku" bar opens an
// immersive full-screen conversation (ImmersiveChat). The graph lives in the Knowledge view.
export function Shell() {
  const {
    presenceState, setPresenceState,
    chatHistory, setChatHistory,
    addMessage, updateLastPikuMessage, updateLastPikuThinking,
    inputText, setInputText,
  } = useAppState()

  const { sendMessage, isSending } = useChat({
    addMessage, setPresenceState, setInputText, updateLastPikuMessage, updateLastPikuThinking,
  })
  useConversationPersistence({ chatHistory, setChatHistory, isSending })
  usePresenceCycle(setPresenceState, isSending)

  const [view, setView] = useState<NavKey>('home')
  const [focusGalaxyId, setFocusGalaxyId] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(false)

  const navigateToGalaxy = useCallback((projectName: string) => {
    setFocusGalaxyId(projectName.toLowerCase())
    setView('knowledge')
  }, [])

  // 2.5-PERF — prime Ollama on launch (load the model + warm the KV cache for the static
  // system prefix) so the user's first message isn't a cold ~multi-second first token.
  useEffect(() => {
    void (async () => {
      if (await ollamaService.ensureReachable(8_000)) {
        void ollamaService.warmup(PIKU_SYSTEM_PROMPT)
        void ollamaService.warmupEmbed()
      }
    })()
    void seedAccounts()
  }, [])

  const [voiceOn, setVoiceOn]     = useState(true)   // Piku speaks replies by default
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking]   = useState(false)
  const stopListenRef = useRef<(() => void) | null>(null)
  const prevSending   = useRef(false)

  // 2.5-Voice — speak Piku's reply aloud once a response finishes (when voice is on).
  useEffect(() => {
    if (prevSending.current && !isSending && voiceOn) {
      const last = chatHistory[chatHistory.length - 1]
      if (last?.sender === 'piku' && last.text.trim()) {
        voiceService.speak(last.text, { onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) })
      }
    }
    prevSending.current = isSending
  }, [isSending, voiceOn, chatHistory])

  // Push-to-talk: mic → live transcript into the input → auto-send on final.
  const toggleListening = () => {
    if (listening) { stopListenRef.current?.(); setListening(false); setPresenceState('idle'); return }
    if (!voiceService.sttSupported) return
    voiceService.prime()
    setListening(true)
    setPresenceState('listening')
    stopListenRef.current = voiceService.listen({
      onResult: (t) => setInputText(t),
      onFinal:  (t) => {
        setListening(false)
        const text = t.trim()
        if (text) { setChatOpen(true); sendMessage(text) }
        else setPresenceState('idle')
      },
    })
  }

  const ask = () => {
    const t = inputText.trim()
    if (!t || isSending) return
    voiceService.prime()   // unlock TTS within this user gesture
    setChatOpen(true)
    sendMessage(t)
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#04060c] text-white flex antialiased">
      <CyberBackground />

      <Sidebar view={view} onNavigate={setView} />

      <main className="relative flex-1 min-w-0 overflow-y-auto z-10">
        {view === 'home' && (
          <HomeOS
            inputText={inputText}
            onInputChange={setInputText}
            isSending={isSending}
            onAsk={ask}
            onNavigate={setView}
            presence={presenceState}
          />
        )}
        {view === 'knowledge' && <div className="absolute inset-0"><GraphCanvas focusGalaxyId={focusGalaxyId} onFocusHandled={() => setFocusGalaxyId(null)} /></div>}
        {view !== 'home' && view !== 'knowledge' && (() => {
          const Screen = SCREENS[view] as React.FC<{ onNavigate?: (v: NavKey) => void; onNavigateToGalaxy?: (name: string) => void }> | undefined
          return Screen ? <Screen onNavigate={setView} onNavigateToGalaxy={navigateToGalaxy} /> : <ComingSoon label={view} />
        })()}
      </main>

      <Dock view={view} onNavigate={setView} />

      <AnimatePresence>
        {chatOpen && (
          <ImmersiveChat
            presence={presenceState}
            messages={chatHistory}
            inputText={inputText}
            isSending={isSending}
            onInputChange={setInputText}
            onSend={ask}
            onClose={() => setChatOpen(false)}
            voiceOn={voiceOn}
            onToggleVoice={() => setVoiceOn(v => { if (v) { voiceService.cancel(); setSpeaking(false) } else { voiceService.prime() } return !v })}
            listening={listening}
            onToggleListening={toggleListening}
            sttSupported={voiceService.sttSupported}
            speaking={speaking}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-8">
      <span className="text-cyan-300/60 text-3xl drop-shadow-[0_0_12px_rgba(34,211,238,0.6)]">✦</span>
      <div className="text-white/75 text-lg capitalize">{label}</div>
      <div className="text-white/35 text-sm max-w-sm">This surface is specified in the UI plan — its data and actions wire in a later sprint.</div>
    </div>
  )
}

