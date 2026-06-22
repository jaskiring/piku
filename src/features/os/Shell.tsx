import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence }                     from 'framer-motion'
import { useAppState }                        from '../../hooks/useAppState'
import { useChat }                            from '../chat'
import { PIKU_SYSTEM_PROMPT }                 from '../chat/hooks/useChat'
import { agentHub }                           from './screens/agentSession'
import { ollamaService }                      from '../../services/OllamaService'
import { opencodeProvider }                   from '../../services/OpencodeProvider'
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
import { connectorFeed }                      from '../../services/accounts/ConnectorFeed'
import { hideAllEmbeds }                      from '../../services/embed'

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
  const [voiceOn, setVoiceOn]     = useState(true)   // Piku speaks replies by default
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking]   = useState(false)
  // Pause the autonomous idle cycle whenever the loop owns presence — sending, speaking aloud, or
  // weaving the turn into memory (updating) — so those states aren't overwritten by the cycle.
  usePresenceCycle(setPresenceState, isSending || speaking || presenceState === 'updating')

  // Home chat is backed by the SAME agentHub sessions as the Agent screen — one consistent model
  // (agentHub also owns persistence to IDB v7, replacing the old conversations-store path).
  // Re-render on hub changes; reload the visible history whenever the active session changes.
  const [, forceHub] = useState(0)
  useEffect(() => agentHub.subscribe(() => forceHub(n => n + 1)), [])
  const activeSessionId = agentHub.active()?.id ?? null
  const prevSessionId   = useRef<string | null>(activeSessionId)
  useEffect(() => {
    if (activeSessionId === prevSessionId.current || isSending) return   // don't clobber an active send
    prevSessionId.current = activeSessionId
    const turns = agentHub.active()?.turns ?? []
    setChatHistory(turns.map(t => ({
      id: crypto.randomUUID(),
      sender: (t.role === 'you' ? 'user' : 'piku') as 'user' | 'piku',
      text: t.text,
    })))
  }, [activeSessionId, isSending, setChatHistory])

  const [view, setView] = useState<NavKey>('home')
  const [focusGalaxyId, setFocusGalaxyId] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(false)

  // Embed lifecycle: keep the Tauri child webviews (WhatsApp/LinkedIn) ALIVE across screen
  // switches. They're hidden when leaving an embed surface and re-shown on re-entry — never
  // destroyed — so the site's session/login state and scroll position persist. Without this,
  // every visit to Apps/Playground re-created the panels and WhatsApp/LinkedIn reloaded fully.
  const EMBED_SURFACES: NavKey[] = ['apps', 'playground']
  useEffect(() => {
    if (EMBED_SURFACES.includes(view)) return            // entering an embed surface → screen mounts and shows them
    void hideAllEmbeds()                                  // leaving  → park them off-screen (state preserved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

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
    void opencodeProvider.ensureServer()   // warm Piku's deep-thinking brain (opencode serve) at launch
    void seedAccounts()
    connectorFeed.startAutoRefresh()   // shared connector cache refreshes every 5 min
  }, [])

  const stopListenRef = useRef<(() => void) | null>(null)
  const prevSending   = useRef(false)

  // 2.5-Voice — speak Piku's reply aloud once a response finishes (when voice is on).
  // While speaking, the orb takes the 'speaking' presence (then returns to idle).
  useEffect(() => {
    if (prevSending.current && !isSending && voiceOn) {
      const last = chatHistory[chatHistory.length - 1]
      if (last?.sender === 'piku' && last.text.trim()) {
        voiceService.speak(last.text, {
          onStart: () => { setSpeaking(true); setPresenceState('speaking') },
          onEnd:   () => { setSpeaking(false); setPresenceState('idle') },
        })
      }
    }
    prevSending.current = isSending
  }, [isSending, voiceOn, chatHistory, setPresenceState])

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

