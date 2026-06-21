import { ollamaService } from './OllamaService'

// The reasoning-flow planner. Before Piku answers a non-trivial request, it first decides whether
// the request is SIMPLE (a direct task/command/greeting/quick fact → just do it) or COMPLEX (needs
// analysis → show the understand-the-problem map and a plan before executing). The Agent renders
// this as the right-side flow: UNDERSTAND → PLAN → ACT. Simple requests skip the graphs entirely.
//
// Speed optimisation: a cheap local heuristic classifies ~80 % of turns without touching the LLM,
// saving a full round-trip on every simple command. Only ambiguous/complex asks fall through to
// the LLM classifier.

export interface ReasoningFlow {
  simple: boolean
  understand?: string[]   // key aspects / sub-questions of the problem
  plan?: string[]         // ordered steps to resolve it
}

// Three-way intent used to route a turn:
//   tool    — a chore (open an app, read mail, check calendar/commits, get headlines). Fire the
//             matching tool IMMEDIATELY, no deliberation, no graph. think=false.
//   complex — needs analysis/judgement/multiple steps. Show the Understand→Plan graph. think=true.
//   simple  — greeting / small talk / quick chat. Plain reply, no graph. think=false.
export type IntentKind = 'tool' | 'complex' | 'simple'
export interface Intent { kind: IntentKind }

// ── Cheap heuristic: classify locally, zero LLM cost ──────────────────────────────────

const TOOL_KEYWORDS = /\b(open|launch|show|play|start|focus|bring|raise|mute|unmute|hide|close|quit)\b/i
const FACT_KEYWORDS = /\b(what time|what('s| is) the (date|day|weather)|how (old|many|much|far|long|big)|where (is|are|was)|who (is|are|was|did)|when (is|was|did)|tell me (about|a )|my (name|email|ip|address))\b/i
const GREETING = /^(hey|hi|hello|yo|sup|morning|evening|afternoon|night|thanks?|thx|bye|see ya|later|good\b)/i

function isLikelySimple(msg: string): boolean {
  const t = msg.trim()
  if (t.length <= 6) return true                          // "ok", "sure", "yes", "no"
  if (GREETING.test(t)) return true                        // greetings / thanks
  if (TOOL_KEYWORDS.test(t)) return true                   // open/launch/show/play → tool call
  if (FACT_KEYWORDS.test(t)) return true                   // what time / who / where
  // Short sentences with no "complex" markers (explain, why, how to, compare, design, plan…)
  if (t.length <= 50 && !/\b(explain|analyze|compare|design|plan|architect|review|evaluate|debug|investigate|why does|how (should|can|do|to) I|what('s| would be) the (best|right|difference))\b/i.test(t)) {
    return true
  }
  return false
}

// ── Intent classification: tool vs complex vs simple (zero LLM cost) ──────────────────

// Mac actions + connector reads → fire the matching tool immediately. Imperative chores, not analysis.
const TOOL_INTENT = /\b(open|launch|start|run|show|play|focus|bring|raise|mute|unmute|hide|close|quit|switch to|go to|take me to)\b|\b(e?mails?|gmail|inbox|unread|calendar|meeting|meetings|schedule|agenda|event|events|commit|commits|shipped|pushed|repo|repos|repositor(y|ies)|github|headlines?|news|search|look up|google|weather|files?|folders?|director(y|ies)|list)\b|\bwhat'?s? (the )?(time|date|day)\b|\bwhat'?s (on |in )?(my )?(calendar|inbox|schedule|email)\b/i

// Genuine analysis / judgement / multi-step → show Understand→Plan and reason.
const COMPLEX_MARKERS = /\b(explain|analy[sz]e|compare|contrast|design|architect|strateg(y|ise|ize)|review|evaluate|assess|debug|troubleshoot|investigate|brainstorm|outline|refactor|trade-?offs?|pros and cons)\b|\bwhy (do|does|is|are|did|would|should)\b|\bhow (should|can|do|to|would)\b|\bwhat'?s? (the )?(best|right|difference|trade)\b/i

/** Route a turn synchronously, no LLM cost. The graph gate is exactly `kind === 'complex'`,
 *  so the reasoning graph is reliable (always for complex, never for chores). For complex turns
 *  the caller then calls `planReasoning()` to fill the actual understand/plan. */
export function classifyIntent(message: string): Intent {
  const t = message.trim()
  if (GREETING.test(t) && t.length <= 24) return { kind: 'simple' }   // "hey", "thanks!"
  if (COMPLEX_MARKERS.test(t))            return { kind: 'complex' }   // analysis verbs win over a stray tool word
  if (TOOL_INTENT.test(t))                return { kind: 'tool' }      // chore → act now
  if (t.length <= 6)                      return { kind: 'simple' }
  if (FACT_KEYWORDS.test(t))              return { kind: 'simple' }
  // long / multi-clause questions with no tool intent lean complex
  if (t.length > 120 || (/\band then\b|;/.test(t) && t.length > 60)) return { kind: 'complex' }
  return { kind: 'simple' }
}

// ── LLM fallback: classify via model (expensive) ──────────────────────────────────

const SYSTEM = `You are Piku's planning module. Look at the user's latest message and classify it.

SIMPLE = a direct task or command (open an app, search the web, list files), a greeting, small talk,
an insult/vent, or a quick factual question. These need no plan.
COMPLEX = anything needing analysis, multiple steps, research, comparison, design, or judgment.

Return ONLY JSON, nothing else:
- If simple:  {"simple": true}
- If complex: {"simple": false,
    "understand": ["3-5 short phrases naming the key aspects or sub-questions of the problem"],
    "plan": ["3-6 short imperative steps to resolve it"]}
Each phrase/step must be under 8 words. No markdown, no prose.`

async function planReasoningViaLLM(message: string): Promise<ReasoningFlow> {
  const out = await ollamaService.chatJSON<ReasoningFlow>([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: message },
  ])
  // Fail open to "simple" so a planner hiccup never blocks the actual answer.
  if (!out || typeof out.simple !== 'boolean') return { simple: true }
  if (out.simple) return { simple: true }
  return {
    simple: false,
    understand: Array.isArray(out.understand) ? out.understand.filter(Boolean).slice(0, 5) : [],
    plan:       Array.isArray(out.plan)       ? out.plan.filter(Boolean).slice(0, 6)       : [],
  }
}

// ── Public API ────────────────────────────────────────────────────────────────────

/** Classify a user message as simple or complex. Uses a cheap local heuristic first;
 *  falls through to the LLM only for ambiguous asks. */
export async function planReasoning(message: string): Promise<ReasoningFlow> {
  if (isLikelySimple(message)) return { simple: true }
  return planReasoningViaLLM(message)
}
