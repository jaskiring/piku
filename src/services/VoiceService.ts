import { logger } from '../lib/logger'

// 2.5-Voice — the voice loop (browser-native MVP, zero new deps), adapted from the Mark-XL
// audit. STT via Web Speech (mic → text); TTS via SpeechSynthesis (Piku speaks). Both are
// feature-detected. WKWebView quirks handled: voices load async (voiceschanged), the engine is
// primed inside a user gesture (first utterance is otherwise dropped), and we resume() if paused.

interface ListenHandlers {
  onResult?: (text: string) => void
  onFinal?:  (text: string) => void
  onEnd?:    () => void
}

class VoiceService {
  private voices: SpeechSynthesisVoice[] = []
  private primed = false

  constructor() {
    const s = this.synth
    if (s) {
      const load = () => { this.voices = s.getVoices() }
      load()
      try { s.addEventListener('voiceschanged', load) } catch { /* older webview */ }
    }
  }

  private get synth(): SpeechSynthesis | undefined {
    return typeof window !== 'undefined' ? window.speechSynthesis : undefined
  }

  get sttSupported(): boolean {
    return typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  }
  get ttsSupported(): boolean { return !!this.synth }

  // Call inside a user gesture (click/keypress) to unlock the engine — some webviews silently
  // drop the first programmatic speak unless it was warmed within a gesture.
  prime(): void {
    const s = this.synth
    if (!s || this.primed) return
    this.primed = true
    try {
      const u = new SpeechSynthesisUtterance(' ')
      u.volume = 0
      s.speak(u)
    } catch { /* non-fatal */ }
  }

  listen({ onResult, onFinal, onEnd }: ListenHandlers): () => void {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const w = window as any
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!Ctor) { onEnd?.(); return () => {} }

    const rec = new Ctor()
    rec.lang = 'en-US'
    rec.continuous = false
    rec.interimResults = true

    let finalText = ''
    rec.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += r[0].transcript
        else interim += r[0].transcript
      }
      onResult?.((finalText + interim).trim())
    }
    rec.onerror = (e: any) => { logger.error('stt error', { error: String(e?.error ?? e) }) }
    rec.onend = () => { onFinal?.(finalText.trim()); onEnd?.() }

    try { rec.start() } catch (err) { logger.error('stt start failed', { error: String(err) }); onEnd?.() }
    return () => { try { rec.stop() } catch { /* already stopped */ } }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  speak(text: string, opts?: { onStart?: () => void; onEnd?: () => void }): void {
    const clean = text
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '') // emojis — Piku speaks in plain words, not emoji
      .replace(/[*_`#>~]|\[|\]|\(https?:[^)]+\)/g, '')
      .replace(/\s+/g, ' ').trim()
    if (!clean) { opts?.onEnd?.(); return }

    // Prefer the local Piper neural voice (amy) inside the desktop app; fall back to the macOS voice.
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      this.speakPiper(clean, opts)
      return
    }
    this.speakWeb(clean, opts)
  }

  private speakPiper(clean: string, opts?: { onStart?: () => void; onEnd?: () => void }): void {
    this.cancel()
    opts?.onStart?.()
    void import('@tauri-apps/api/core')
      .then(m => m.invoke('piper_speak', { text: clean }))
      .then(() => opts?.onEnd?.())
      .catch((e) => { logger.info('piper unavailable — using macOS voice', { error: String(e) }); this.speakWeb(clean, opts) })
  }

  private speakWeb(clean: string, opts?: { onStart?: () => void; onEnd?: () => void }): void {
    const synth = this.synth
    if (!synth) { opts?.onEnd?.(); return }
    synth.cancel()
    if (synth.paused) synth.resume()
    const u = new SpeechSynthesisUtterance(clean)
    u.rate = 1.0
    u.pitch = 1.0
    const v = this.pickVoice()
    if (v) u.voice = v
    u.onstart = () => opts?.onStart?.()
    u.onend   = () => opts?.onEnd?.()
    u.onerror = (e: SpeechSynthesisErrorEvent) => { logger.error('tts error', { error: String(e.error) }); opts?.onEnd?.() }
    synth.speak(u)
    logger.info('tts speak (web)', { chars: clean.length, voice: v?.name ?? 'default' })
  }

  cancel(): void { this.synth?.cancel() }

  private pickVoice(): SpeechSynthesisVoice | undefined {
    const voices = this.voices.length ? this.voices : (this.synth?.getVoices() ?? [])
    const en = voices.filter(v => v.lang.toLowerCase().startsWith('en'))
    return en.find(v => /premium|enhanced|neural/i.test(v.name))          // best macOS neural voices first
        ?? en.find(v => /ava|zoe|samantha|serena|jamie|nathan|kate/i.test(v.name))
        ?? en[0]
        ?? voices[0]
  }
}

export const voiceService = new VoiceService()
