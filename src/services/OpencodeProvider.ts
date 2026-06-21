import { logger } from '../lib/logger'

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
    if (reasoning && onThinking) onThinking(reasoning.trim())
    return answer
  }
}

export const opencodeProvider = new OpencodeProvider()
