import { logger } from '../lib/logger'

// ---------------------------------------------------------------------------
// Meta-preamble strip — removes a contiguous leading block of sentences where
// the model narrates its own plan or talks about the user in the third person,
// e.g. "The user wants…", "Let me give them…", "I'll just answer directly…".
// These are signs the model leaked its chain-of-thought into the answer field.
//
// Only the LEADING contiguous block is removed, never mid-reply content.
// Stripped text is returned separately so the caller can route it to onThinking.
// ---------------------------------------------------------------------------

const META_PREAMBLE_PATTERNS = [
  /^The user wants\b/i,
  /^The user needs\b/i,
  /^The user is\b/i,
  /^Let me\b/i,
  /^Let's give\b/i,
  /^I'll /i,
  /^I will /i,
  /^I should\b/i,
  /^I don'?t need\b/i,
  /^I need to\b/i,
  /^Okay,? so\b/i,
  /^First,? I\b/i,
  /^So,? the user\b/i,
  /^They want\b/i,
  /^They need\b/i,
]

/**
 * Split `text` into { preamble, answer }.
 * `preamble` is the leading block of meta-narration sentences (may be empty).
 * `answer`   is the rest — the first genuine first-person/direct reply.
 *
 * Algorithm:
 *  1. Split on sentence-ending punctuation (. ! ?) followed by whitespace or end.
 *  2. Walk sentences from the top; as long as each sentence matches any META pattern,
 *     accumulate it into preamble.  Stop at the first non-matching sentence.
 *  3. Re-join preamble and answer separately.
 */
export function stripMetaPreamble(text: string): { preamble: string; answer: string } {
  // Quick bail — no match anywhere near the start saves the split cost.
  const first200 = text.slice(0, 200)
  if (!META_PREAMBLE_PATTERNS.some(p => p.test(first200.trimStart()))) {
    return { preamble: '', answer: text }
  }

  // Sentence tokeniser: split keeping the delimiter so we can reassemble losslessly.
  // Matches end-of-sentence punctuation followed by one or more whitespace chars (or end).
  const sentenceRe = /(?<=[.!?])\s+/g
  const sentences: string[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = sentenceRe.exec(text)) !== null) {
    sentences.push(text.slice(last, m.index + 1).trimEnd())  // include trailing punct
    last = m.index + m[0].length
  }
  if (last < text.length) sentences.push(text.slice(last))   // final fragment

  let cutIdx = 0
  for (const s of sentences) {
    const trimmed = s.trimStart()
    if (META_PREAMBLE_PATTERNS.some(p => p.test(trimmed))) {
      cutIdx++
    } else {
      break
    }
  }

  if (cutIdx === 0) return { preamble: '', answer: text }
  if (cutIdx >= sentences.length) return { preamble: text.trim(), answer: '' }

  const preamble = sentences.slice(0, cutIdx).join(' ').trim()
  const answer   = sentences.slice(cutIdx).join(' ').trim()
  return { preamble, answer }
}

// ---------------------------------------------------------------------------

// Piku's "deep-thinking" brain. The local 4B (OllamaService) is fast + private but a weak reasoner;
// for real thinking we hand the turn to a free, capable model (DeepSeek / MiMo / …) through a
// headless `opencode serve` HTTP API. Piku still OWNS the context locally (World Model + summary)
// and passes it as the system prompt — opencode is just the engine. Swap OPENCODE_MODEL later for a
// self-hosted private model and nothing else changes (capability routing, P1 — never a model name
// outside this file + OllamaService).
//
// Verified API shape (opencode 1.17.x):
//   POST /session                      → { id }
//   POST /session/:id/message          → { info, parts: [{type:'reasoning'|'text'|…, text}] }
//     body: { model:{providerID,modelID}, system?, parts:[{type:'text',text}] }
//   free Zen models return cost:0 and need no API key.

const OPENCODE_PORT  = 47817                               // Piku-private port (avoids the desktop app's :4096)
const OPENCODE_BASE  = `http://127.0.0.1:${OPENCODE_PORT}`
export const OPENCODE_MODEL = { providerID: 'opencode', modelID: 'deepseek-v4-flash-free' }

interface SessionResp { id: string }
interface MessagePart { type: string; text?: string }
interface MessageResp { parts?: MessagePart[] }

class OpencodeProvider {
  /** Is the local opencode server up? */
  async isReachable(timeoutMs = 1500): Promise<boolean> {
    try {
      const r = await fetch(`${OPENCODE_BASE}/`, { signal: AbortSignal.timeout(timeoutMs) })
      return r.ok
    } catch { return false }
  }

  /** Ensure `opencode serve` is running (launch it via Rust if not), then wait until reachable. */
  async ensureServer(): Promise<boolean> {
    if (await this.isReachable()) return true
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('start_opencode_server', { port: OPENCODE_PORT })
    } catch (e) {
      logger.warn('opencode: could not launch serve', { error: String(e) })
      return false
    }
    for (let i = 0; i < 16; i++) {                          // poll ~8s for cold start
      await new Promise(r => setTimeout(r, 500))
      if (await this.isReachable()) return true
    }
    return false
  }

  /**
   * One reasoning turn on the free capable model. `system` carries Piku's identity + World-Model
   * context; `history` gives the model the recent conversation. Returns the final answer; streams
   * the model's reasoning to `onThinking` if provided. Non-streaming for the answer (v1).
   */
  async chat(
    system: string,
    user: string,
    history: { role: 'you' | 'piku'; text: string }[] = [],
    onThinking?: (text: string) => void,
  ): Promise<string> {
    const sRes = await fetch(`${OPENCODE_BASE}/session`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      signal: AbortSignal.timeout(10_000),
    })
    if (!sRes.ok) throw new Error(`opencode session ${sRes.status}`)
    const { id } = await sRes.json() as SessionResp

    const convo = history.slice(-6).map(t => `${t.role === 'you' ? 'User' : 'Piku'}: ${t.text}`).join('\n')
    const text  = convo ? `Conversation so far:\n${convo}\n\nUser: ${user}` : user

    const mRes = await fetch(`${OPENCODE_BASE}/session/${id}/message`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: OPENCODE_MODEL, system, parts: [{ type: 'text', text }] }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!mRes.ok) throw new Error(`opencode message ${mRes.status}`)
    const data = await mRes.json() as MessageResp
    const parts = data.parts ?? []

    let reasoning = parts.filter(p => p.type === 'reasoning').map(p => p.text ?? '').join('')
    let answer    = parts.filter(p => p.type === 'text').map(p => p.text ?? '').join('')
    // Some models embed reasoning as <think>…</think> inside the text part — pull it out so it goes
    // to the thinking panel, never into the chat answer.
    answer = answer.replace(/<think>([\s\S]*?)<\/think>/gi, (_m, r) => { reasoning += r; return '' })
                   .replace(/<\/?think>/gi, '').trim()
    // Strip any leading meta-preamble (model talking about the user / narrating its plan).
    const { preamble: metaPre, answer: cleanAnswer } = stripMetaPreamble(answer)
    if (metaPre && onThinking) onThinking('\n[preamble stripped]\n' + metaPre)
    if (reasoning && onThinking) onThinking(reasoning.trim())
    return cleanAnswer || answer   // fallback to original if strip ate everything
  }

  /**
   * Streaming variant — subscribes to the server's SSE `/event` stream and fires a prompt, so the
   * model's reasoning and answer arrive token-by-token (verified against opencode 1.17.x):
   *   message.part.delta { field: 'text'|'reasoning', delta }   ← the live tokens
   *   session.idle { sessionID }                                 ← turn complete
   * onThinking gets reasoning deltas (→ thinking panel); onContent gets answer deltas. Returns the
   * full answer. Falls back to the non-streaming chat() on any failure.
   */
  async chatStream(
    system: string,
    user: string,
    history: { role: 'you' | 'piku'; text: string }[] = [],
    onThinking?: (delta: string) => void,
    onContent?: (delta: string) => void,
  ): Promise<string> {
    const sRes = await fetch(`${OPENCODE_BASE}/session`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      signal: AbortSignal.timeout(10_000),
    })
    if (!sRes.ok) throw new Error(`opencode session ${sRes.status}`)
    const { id } = await sRes.json() as SessionResp

    const convo = history.slice(-6).map(t => `${t.role === 'you' ? 'User' : 'Piku'}: ${t.text}`).join('\n')
    const text  = convo ? `Conversation so far:\n${convo}\n\nUser: ${user}` : user

    const ctrl = new AbortController()
    // Hard wall: abort the SSE connection if the whole turn takes > 120 s.
    const hardTimer = setTimeout(() => ctrl.abort(), 120_000)
    try {
      // Open the event stream BEFORE firing the prompt so no deltas are missed.
      const evRes = await fetch(`${OPENCODE_BASE}/event`, { signal: ctrl.signal })
      if (!evRes.ok || !evRes.body) throw new Error(`opencode event ${evRes.status}`)

      const promptRes = await fetch(`${OPENCODE_BASE}/session/${id}/prompt_async`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: OPENCODE_MODEL, system, parts: [{ type: 'text', text }] }),
        signal: AbortSignal.timeout(15_000),
      })
      if (!promptRes.ok) throw new Error(`opencode prompt_async ${promptRes.status}`)

      const reader = evRes.body.getReader()
      const dec = new TextDecoder()
      let buf = '', answer = ''

      // Idle-timeout watchdog: if no new delta arrives for 7 s after the first token we've
      // received some output, resolve with what we have rather than hanging forever.  This
      // fires if the model finishes but the server never sends session.idle.
      let lastDeltaAt = 0          // 0 = no delta yet; we only arm the watchdog after the first token
      let idleTimer: ReturnType<typeof setTimeout> | null = null
      const IDLE_TIMEOUT_MS = 7_000

      const resolveEarly = (resolve: (v: string) => void) => {
        const result = answer.replace(/<\/?think>/gi, '').trim()
        void reader.cancel().catch(() => {})
        resolve(result)
      }

      // Wrap the reader loop in a Promise so the idle watchdog can resolve it externally.
      const loopResult = await new Promise<string>((resolve, reject) => {
        const armIdle = () => {
          if (idleTimer) clearTimeout(idleTimer)
          idleTimer = setTimeout(() => resolveEarly(resolve), IDLE_TIMEOUT_MS)
        }

        const readLoop = async () => {
          try {
            while (true) {
              const { value, done } = await reader.read()
              if (done) { resolve(answer.replace(/<\/?think>/gi, '').trim()); break }
              buf += dec.decode(value, { stream: true })
              const lines = buf.split('\n'); buf = lines.pop() ?? ''
              for (const line of lines) {
                if (!line.startsWith('data:')) continue
                let ev: any
                try { ev = JSON.parse(line.slice(5).trim()) } catch { continue }
                const p = ev?.properties
                if (!p || p.sessionID !== id) continue
                if (ev.type === 'message.part.delta') {
                  const delta: string = p.delta ?? ''
                  if (p.field === 'reasoning') { onThinking?.(delta) }
                  else if (p.field === 'text') { answer += delta; onContent?.(delta) }
                  // Arm/reset the idle watchdog on every delta — only after the first token.
                  if (delta) { lastDeltaAt = Date.now(); armIdle() }
                } else if (ev.type === 'session.idle' || ev.type === 'message.completed' || ev.type === 'done') {
                  if (idleTimer) clearTimeout(idleTimer)
                  void reader.cancel().catch(() => {})
                  resolve(answer.replace(/<\/?think>/gi, '').trim())
                  return
                }
              }
            }
          } catch (err) {
            if (idleTimer) clearTimeout(idleTimer)
            // If we already have an answer (stream closed after content), resolve; otherwise reject.
            if (answer && lastDeltaAt > 0) resolve(answer.replace(/<\/?think>/gi, '').trim())
            else reject(err instanceof Error ? err : new Error(String(err)))
          }
        }
        void readLoop()
      })

      if (idleTimer) clearTimeout(idleTimer)
      void lastDeltaAt // suppress unused-variable lint (read above in armIdle closure)

      // Post-process: strip any leading meta-preamble from the fully-accumulated answer.
      // The live onContent callbacks may have already emitted the preamble to the UI — the caller
      // (AgentScreen.runBrain) uses the RETURNED value to set the turn text, so stripping here
      // ensures the persisted turn is clean. A future enhancement could buffer the first few
      // sentences live, but for now we strip post-hoc and route the preamble to onThinking.
      const { preamble: streamPre, answer: streamClean } = stripMetaPreamble(loopResult)
      if (streamPre) {
        onThinking?.('\n[preamble stripped]\n' + streamPre)
      }
      return streamClean || loopResult   // fallback if strip ate everything
    } finally {
      clearTimeout(hardTimer)
    }
  }
}

export const opencodeProvider = new OpencodeProvider()
