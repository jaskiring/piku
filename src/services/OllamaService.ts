import { logger } from '../lib/logger'

const OLLAMA_BASE    = 'http://localhost:11434'
const CHAT_MODEL     = 'qwen3:4b'   // 4B fits a 16GB M4 comfortably + keeps thinking mode.
                                    // Model names live ONLY here (P1) — swap freely.
const EMBED_MODEL    = 'nomic-embed-text'
const CHAT_TIMEOUT       = 240_000  // 4 min — qwen3 reasoning can be lengthy on a busy machine
const EXTRACTION_TIMEOUT = 300_000  // 5 min — for document/conversation extraction (background)
const EMBED_TIMEOUT      =  15_000
const NUM_CTX            = 8192     // cap context per request → smaller KV cache, snappy on 16GB
                                    // (Piku is retrieval-augmented, so it never needs a huge window)
const CHAT_NUM_PREDICT   = 2048     // runaway guard for interactive replies (thinking + answer)
const EXTRACT_NUM_PREDICT = 1024    // background extraction: short JSON only → keep it cheap & fast

// 2.5-PERF — keep the model resident between turns so back-to-back messages skip the
// multi-second reload. RAM-aware (NOT `-1`/forever, which would pin ~3GB indefinitely on a
// 16GB Mac); 30m is long enough for an ambient companion, short enough to release when idle.
const CHAT_KEEP_ALIVE  = '30m'
const EMBED_KEEP_ALIVE  = '10m'

// Shown in the overlay status strip. The ProviderRegistry (Sprint 2.5-P) will make
// this dynamic — local Ollama vs. a Claude-CLI escalation.
export const ACTIVE_BRAIN = { model: CHAT_MODEL, where: 'local' as const }

export interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> }
}
export interface OllamaTool {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}
export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: OllamaToolCall[]   // present on assistant turns that call tools
  tool_name?:  string             // present on `tool` result turns fed back to the model
}

class OllamaService {
  // ── Connection resilience (2.5-PERF) ───────────────────────────────────────

  async isReachable(): Promise<boolean> {
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3_000) })
      return res.ok
    } catch {
      return false
    }
  }

  // Poll until Ollama answers (it may be starting up / waking) or the budget runs out.
  async ensureReachable(timeoutMs = 8_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    let delay = 300
    while (Date.now() < deadline) {
      if (await this.isReachable()) return true
      await sleep(delay)
      delay = Math.min(Math.round(delay * 1.6), 1_500)
    }
    return this.isReachable()
  }

  // POST with one transparent retry: a *connection* failure (Ollama down/asleep — a thrown
  // TypeError, not an HTTP status) triggers a reachability re-check + a single retry.
  private async post(path: string, body: object, signal: AbortSignal): Promise<Response> {
    const doFetch = () => fetch(`${OLLAMA_BASE}${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body:    JSON.stringify(body),
    })
    try {
      return await doFetch()
    } catch (err) {
      if (signal.aborted) throw err   // genuine timeout/cancel — don't mask it
      logger.ollama('connection failed — re-checking Ollama', { error: String(err) })
      if (!(await this.ensureReachable(6_000))) throw err
      return doFetch()
    }
  }

  // Prime the model at launch: load it into RAM and warm the KV cache for the *real* static
  // system prefix, so the user's first message isn't a cold ~multi-second first token.
  // Pass the SAME static prefix the live chat uses (so the cached prefix is reused).
  async warmup(systemPrefix?: string): Promise<void> {
    const t0 = Date.now()
    try {
      const messages: OllamaChatMessage[] = systemPrefix
        ? [{ role: 'system', content: systemPrefix }, { role: 'user', content: 'hi' }]
        : [{ role: 'user', content: 'hi' }]
      await this.post('/api/chat', {
        model: CHAT_MODEL, stream: false, think: false, keep_alive: CHAT_KEEP_ALIVE,
        messages, options: { num_ctx: NUM_CTX, num_predict: 1 },
      }, AbortSignal.timeout(90_000))
      logger.ollama('warmup complete', { model: CHAT_MODEL, ms: Date.now() - t0 })
    } catch (err) {
      logger.ollama('warmup skipped', { error: String(err) })
    }
  }

  // Warm the embedding model too (memory/graph retrieval uses it on the first turn).
  async warmupEmbed(): Promise<void> {
    try { await this.embed('warmup') } catch { /* non-fatal */ }
  }

  // ── Chat ──────────────────────────────────────────────────────────────────

  async chat(
    messages:    OllamaChatMessage[],
    temperature = 0.7,
    timeoutMs   = CHAT_TIMEOUT,
    think       = false,   // extraction/summary callers don't need visible reasoning → far faster
  ): Promise<string> {
    logger.ollama('chat request', { model: CHAT_MODEL, turns: messages.length, temperature, timeoutMs })

    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
      logger.error('chat timeout', { model: CHAT_MODEL, ms: timeoutMs })
    }, timeoutMs)

    try {
      const res = await this.post('/api/chat', {
        model:   CHAT_MODEL,
        stream:  false,
        think,
        keep_alive: CHAT_KEEP_ALIVE,
        messages,
        options: { temperature, num_ctx: NUM_CTX, num_predict: EXTRACT_NUM_PREDICT },
      }, controller.signal)

      if (!res.ok) throw new Error(`Ollama chat error: ${res.status} ${res.statusText}`)

      const data = await res.json() as { message?: { content?: string } }
      const raw  = data.message?.content ?? ''
      const text = stripThinkingTokens(raw)

      logger.ollama('chat response', { chars: text.length, hadThinking: raw.length !== text.length })
      return text

    } catch (err) {
      logger.error('chat failed', { error: String(err) })
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  // ── Streaming Chat ────────────────────────────────────────────────────────

  async chatStream(
    messages:    OllamaChatMessage[],
    onChunk:     (text: string) => void,
    onThinking?: (text: string) => void,
    temperature = 0.7,
    timeoutMs   = CHAT_TIMEOUT,
    think       = true,    // interactive chat: show Piku's reasoning live
  ): Promise<{ response: string; thinking: string; latencyMs: number }> {
    const start = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
      logger.error('chat stream timeout', { model: CHAT_MODEL, ms: timeoutMs })
    }, timeoutMs)

    try {
      const res = await this.post('/api/chat', {
        model:   CHAT_MODEL,
        stream:  true,
        think,
        keep_alive: CHAT_KEEP_ALIVE,
        messages,
        options: { temperature, num_ctx: NUM_CTX, num_predict: CHAT_NUM_PREDICT },
      }, controller.signal)

      if (!res.ok)   throw new Error(`Ollama chat error: ${res.status} ${res.statusText}`)
      if (!res.body) throw new Error('Response body is null')

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let answer   = ''
      let thinking = ''

      // qwen3 via Ollama streams reasoning in a separate `thinking` field and the
      // final answer in `content`. Each chunk carries the new delta for either.
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const lines = decoder.decode(value, { stream: true }).split('\n').filter(l => l.trim())
        for (const line of lines) {
          try {
            const msg = (JSON.parse(line) as { message?: { content?: string; thinking?: string } }).message
            if (!msg) continue
            if (msg.thinking) { thinking += msg.thinking; onThinking?.(msg.thinking) }
            if (msg.content)  { answer   += msg.content;  onChunk(msg.content) }
          } catch { /* malformed NDJSON line — skip */ }
        }
      }

      const latencyMs = Date.now() - start
      logger.ollama('chat stream complete', { chars: answer.length, thinkingChars: thinking.length, latencyMs })
      return { response: answer.trim(), thinking: thinking.trim(), latencyMs }

    } catch (err) {
      logger.error('chat stream failed', { error: String(err) })
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  // ── Tool / Function calling (2.5-T foundation) ──────────────────────────────
  // One non-streaming round: send messages + tools, get back the model's text and any
  // tool_calls. The orchestration loop (route → feed results back → final answer) lives in
  // ToolRouter so this stays a thin transport. Ollama's /api/chat takes an OpenAI-style
  // `tools` array and returns `message.tool_calls`.
  async chatToolRound(
    messages:    OllamaChatMessage[],
    tools:       OllamaTool[],
    temperature = 0.4,
    timeoutMs   = CHAT_TIMEOUT,
  ): Promise<{ content: string; thinking: string; toolCalls: OllamaToolCall[] }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      // think:true → qwen3 returns reasoning in `thinking` (for the agent's thinking panel),
      // a clean answer in `content`, and still emits `tool_calls`. Clean separation.
      const res = await this.post('/api/chat', {
        model:   CHAT_MODEL,
        stream:  false,
        think:   true,
        keep_alive: CHAT_KEEP_ALIVE,
        messages,
        tools,
        options: { temperature, num_ctx: NUM_CTX, num_predict: CHAT_NUM_PREDICT },
      }, controller.signal)

      if (!res.ok) throw new Error(`Ollama tool chat error: ${res.status} ${res.statusText}`)

      const data = await res.json() as { message?: { content?: string; thinking?: string; tool_calls?: OllamaToolCall[] } }
      return {
        content:   stripThinkingTokens(data.message?.content ?? '').trim(),
        thinking:  (data.message?.thinking ?? '').trim(),
        toolCalls: data.message?.tool_calls ?? [],
      }
    } finally {
      clearTimeout(timer)
    }
  }

  // Streaming variant — same as chatToolRound but streams the `thinking` deltas live (for the
  // agent's thinking panel) while still collecting tool_calls at the end.
  async chatToolRoundStream(
    messages:    OllamaChatMessage[],
    tools:       OllamaTool[],
    onThinking?: (delta: string) => void,
    temperature = 0.4,
    timeoutMs   = CHAT_TIMEOUT,
  ): Promise<{ content: string; thinking: string; toolCalls: OllamaToolCall[] }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await this.post('/api/chat', {
        model:   CHAT_MODEL,
        stream:  true,
        think:   true,
        keep_alive: CHAT_KEEP_ALIVE,
        messages,
        tools,
        options: { temperature, num_ctx: NUM_CTX, num_predict: CHAT_NUM_PREDICT },
      }, controller.signal)

      if (!res.ok)   throw new Error(`Ollama tool chat error: ${res.status} ${res.statusText}`)
      if (!res.body) throw new Error('Response body is null')

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let content = '', thinking = ''
      let toolCalls: OllamaToolCall[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const lines = decoder.decode(value, { stream: true }).split('\n').filter(l => l.trim())
        for (const line of lines) {
          try {
            const msg = (JSON.parse(line) as { message?: { content?: string; thinking?: string; tool_calls?: OllamaToolCall[] } }).message
            if (!msg) continue
            if (msg.thinking) { thinking += msg.thinking; onThinking?.(msg.thinking) }
            if (msg.content)  { content += msg.content }
            if (msg.tool_calls && msg.tool_calls.length) toolCalls = msg.tool_calls
          } catch { /* malformed NDJSON line — skip */ }
        }
      }
      return { content: stripThinkingTokens(content).trim(), thinking: thinking.trim(), toolCalls }
    } finally {
      clearTimeout(timer)
    }
  }

  // ── Embeddings ────────────────────────────────────────────────────────────

  async embed(text: string): Promise<number[]> {
    logger.embedding('embed request', { model: EMBED_MODEL, chars: text.length })

    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
      logger.error('embed timeout', { model: EMBED_MODEL, ms: EMBED_TIMEOUT })
    }, EMBED_TIMEOUT)

    try {
      const res = await this.post('/api/embed', {
        model: EMBED_MODEL, input: text, keep_alive: EMBED_KEEP_ALIVE,
      }, controller.signal)

      if (!res.ok) throw new Error(`Ollama embed error: ${res.status} ${res.statusText}`)

      const data = await res.json() as { embeddings?: number[][] }
      const vec  = data.embeddings?.[0]

      if (!vec || vec.length === 0) throw new Error('Ollama returned empty embedding vector')

      logger.embedding('embed response', { dims: vec.length })
      return vec

    } catch (err) {
      logger.error('embed failed', { error: String(err) })
      throw err
    } finally {
      clearTimeout(timer)
    }
  }
}

// Singleton — one HTTP client for the entire app lifetime
export const ollamaService = new OllamaService()

// Extraction tasks (document or conversation) run in the background and tolerate
// longer waits. Import this constant instead of hardcoding 300_000.
export { EXTRACTION_TIMEOUT }

// ── Helpers ───────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// qwen3 outputs <think>…</think> blocks before its actual response.
// Strip them so users never see raw reasoning tokens.
function stripThinkingTokens(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}
