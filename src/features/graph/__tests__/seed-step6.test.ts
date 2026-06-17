/**
 * GDD Phase 2 Step 6 — Schema Normalization + Leakage Correction + Learning Loop
 *
 * Changes from Step 5:
 *
 *   Schema:
 *     • Adds 'concept' node type for architectural and domain concepts
 *     • TYPE_LABEL: 'architectural or domain concept'
 *
 *   Re-types 5 existing architectural layer nodes: decision → concept
 *     Knowledge Graph, Observation Layer, Model Orchestration,
 *     Memory Layer, Retrieval Layer
 *
 *   Adds metadata.domain: 'architecture' to all 6 architectural layer nodes
 *     (mitigates embedding collision between 'Memory Layer' concept
 *      and 'memory' type user-memory nodes)
 *
 *   Fixes 3 architectural leakage edges (concept → uses → technology):
 *     BEFORE: Knowledge Graph   → uses      → IndexedDB
 *     BEFORE: Memory Layer      → uses      → IndexedDB
 *     BEFORE: Model Orchestration → uses    → Ollama
 *     AFTER:  Knowledge Graph   → implements → Persistence ADR
 *     AFTER:  Memory Layer      → implements → Persistence ADR
 *     AFTER:  Model Orchestration → implements → Chat Response ADR
 *
 *   Removes 1 weak edge (upgraded to implements):
 *     BEFORE: Knowledge Graph → related_to → Persistence ADR
 *     AFTER:  Knowledge Graph → implements → Persistence ADR  (single stronger edge)
 *
 *   Adds Learning Loop as 6th architectural layer concept:
 *     concept, category: architectural-layer, status: planned
 *     domain: architecture
 *     Edges: part_of + 4 cross-connections to principles/goals/constraints
 *
 * Expected outcome:
 *   86 nodes (+1 Learning Loop)
 *   149 edges (-4 removed + 3 implements replacements + 5 Learning Loop = net +4)
 *   9 node types (adds concept)
 *   6 architectural layer nodes (all concept type)
 *   0 leakage edges (concept → uses → technology)
 *
 * Run: npx vitest run src/features/graph/__tests__/seed-step6.test.ts
 */

import 'fake-indexeddb/auto'

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync }                     from 'node:fs'
import { resolve }                          from 'node:path'
import { DocumentSeeder }                   from '../DocumentSeeder'
import { GraphService }                     from '../GraphService'
import { GraphStore }                       from '../GraphStore'
import type { GraphNodeType, GraphRelationship } from '../types'

const ROOT = resolve(__dirname, '../../../..')

// ── Infrastructure ─────────────────────────────────────────────────────────────

const graph = new GraphService()
const store = new GraphStore()
const nameToId = new Map<string, string>()

function nkey(type: GraphNodeType, name: string) {
  return `${type}:${name.toLowerCase().trim()}`
}

async function seedNode(type: GraphNodeType, name: string, attrs: Record<string, unknown> = {}) {
  const node = await graph.createNode(type, name, attrs)
  nameToId.set(nkey(type, name), node.id)
  return node
}

async function createEdge(
  fromType: GraphNodeType, fromName: string,
  rel:      GraphRelationship,
  toType:   GraphNodeType,   toName:   string,
  confidence = 0.95,
): Promise<boolean> {
  const fromId = nameToId.get(nkey(fromType, fromName))
  const toId   = nameToId.get(nkey(toType,   toName))
  if (!fromId || !toId) {
    console.warn(`  ⚠ edge skipped: "${fromName}" → ${rel} → "${toName}"`)
    return false
  }
  await graph.createEdge(fromId, toId, rel, confidence, 'confirmed')
  return true
}

async function syncMap() {
  const nodes = await store.getAllNodes()
  for (const n of nodes) nameToId.set(nkey(n.type as GraphNodeType, n.name), n.id)
}

// ── Baseline data (Steps 1–5 corrected) ───────────────────────────────────────

const SRC05 = 'docs/CANONICAL/05_DECISIONS.md'
const SRC01 = 'docs/CANONICAL/01_PRODUCT_VISION.md'
const SRC_OS = 'docs/PIKU_OPERATING_SYSTEM.md'

const PRINCIPLES_DATA = [
  { name: 'P1: Piku is not the model',                            r: 'Models are replaceable reasoning engines.',                              te: null as null | { rel: GraphRelationship; t: string } },
  { name: 'P2: The World Model is the product',                   r: 'Memory, Graph, Projects are components of the World Model.',             te: null },
  { name: 'P3: Capability-based routing',                        r: 'Model names never appear in business logic.',                            te: { rel: 'related_to' as GraphRelationship, t: 'Ollama' } },
  { name: 'P4: Local-first always',                              r: 'All data in IndexedDB. No network egress without explicit user opt-in.', te: { rel: 'related_to' as GraphRelationship, t: 'IndexedDB' } },
  { name: 'P5: Observation loop is the intended operating mode',  r: 'Reactive Q&A is the fallback interface, not the primary one.',          te: null },
  { name: 'P6: User approval gates all World Model writes',       r: 'ProjectUpdateService.applyApprovedDiff() is the only path.',           te: null },
  { name: 'P7: Personality is data, not a prompt',               r: 'Personality traits must be stored as World Model entities.',            te: null },
  { name: 'P8: IDB migrations are additive only',                r: 'Never drop stores. Never modify existing store schemas.',               te: { rel: 'related_to' as GraphRelationship, t: 'IndexedDB' } },
]

const RULES_DATA = [
  { name: 'Rule 1: Model names only in OllamaService.ts',         r: 'Finding qwen3:14b outside this file is a bug.',        te: { rel: 'related_to' as GraphRelationship, t: 'Ollama' } },
  { name: 'Rule 2: ContextSource is the extension interface',     r: 'New sources implement ContextSource.',                  te: null },
  { name: 'Rule 3: Post-response processing is fire-and-forget',  r: 'Extraction must not block response display.',          te: null },
  { name: 'Rule 4: Extraction services never throw to callers',   r: 'They log errors and return empty.',                    te: null },
  { name: 'Rule 5: Features export only via index.ts',           r: 'No cross-feature imports from internal files.',         te: null },
  { name: 'Rule 6: ContextVersionStore is append-only',          r: 'Never delete context versions.',                       te: null },
]

const TECH_NODES_DATA = [
  { name: 'TypeScript',        cat: 'language'  },
  { name: 'TailwindCSS',       cat: 'framework' },
  { name: 'nomic-embed-text',  cat: 'model'     },
  { name: 'qwen2.5-coder:14b', cat: 'model'     },
  { name: 'Framer Motion',     cat: 'framework' },
  { name: 'Vitest',            cat: 'tool'      },
]

const TECH_CHOICES_DATA = [
  { name: 'Desktop framework: Tauri 2',               r: 'Native OS integration, small binary',   techs: ['Tauri'] },
  { name: 'Frontend: React + TypeScript + TailwindCSS', r: 'Standard, well-supported',            techs: ['React', 'TypeScript', 'TailwindCSS'] },
  { name: 'Local storage: IndexedDB via idb library', r: 'Browser-native',                        techs: ['IndexedDB'] },
  { name: 'Local AI: Ollama',                         r: 'Local-first, no API cost',              techs: ['Ollama'] },
  { name: 'Chat model: qwen3:14b',                    r: 'Strong reasoning, local',               techs: ['qwen3:14b'] },
  { name: 'Embedding model: nomic-embed-text',        r: '768-dim vectors, fast',                 techs: ['nomic-embed-text'] },
  { name: 'Code intelligence: qwen2.5-coder:14b',     r: 'Planned, not yet wired',               techs: ['qwen2.5-coder:14b'] },
  { name: 'Animation: Framer Motion + Canvas',        r: 'Declarative animations, 2D particles', techs: ['Framer Motion', 'Canvas'] },
  { name: 'Test runner: Vitest',                      r: 'Fast, ESM-native',                      techs: ['Vitest'] },
]

const CONSTRAINTS_DATA = [
  { name: 'K1: Zero recurring inference cost for core operations', s: 'Core operations must not incur per-call API costs.',      te: { rel: 'related_to' as GraphRelationship, t: 'Ollama' } },
  { name: 'K2: External AI via browser session automation only',   s: 'Never via API key.',                                      te: null },
  { name: 'K3: Core functionality without paid API or network',    s: 'Must work offline.',                                      te: null },
  { name: 'K4: No data leaves machine without user choice',        s: 'No network egress without opt-in.',                       te: { rel: 'related_to' as GraphRelationship, t: 'IndexedDB' } },
  { name: 'K5: Consequential actions require user confirmation',   s: 'Explicit confirmation required.',                        te: null },
  { name: 'K6: No World Model modification without user approval', s: 'Diff-and-approve is mandatory.',                         te: null },
]

const PHASES_DATA = [
  { name: 'Phase 1: Personal AI assistant',               desc: 'Chat + memory + projects + graph.', status: 'current',
    te: [{ r: 'related_to' as GraphRelationship, t: 'Ollama' }, { r: 'related_to' as GraphRelationship, t: 'IndexedDB' }], ae: [] as string[] },
  { name: 'Phase 2: Persistent World Model depth',        desc: 'Git Observer, Repository entities.', status: 'next', te: [], ae: [] },
  { name: 'Phase 3: Ambient desktop companion',           desc: 'Global hotkey, system tray, always-on-top.', status: 'future', te: [],
    ae: ['Invocation — ⌥ (Option) + Space Global Hotkey', 'Overlay — Full-Screen, Always-On-Top'] },
  { name: 'Phase 4: Proactive observer',                  desc: 'File watcher, IDE plugin, calendar, email.', status: 'future', te: [], ae: [] },
  { name: 'Phase 5: Personal operating system layer',     desc: 'Cross-app intelligence, pattern recognition.', status: 'future', te: [], ae: [] },
  { name: 'Phase 6: Autonomous execution + approval gate', desc: 'Piku can act with explicit user confirmation.', status: 'future',
    te: [], ae: ['K5: Consequential actions require user confirmation', 'K6: No World Model modification without user approval'] },
]

const NORTH_STAR_NAME = 'North Star: Ambient companion that knows everything happening in your world'

const PHILOSOPHY_DATA = [
  { name: 'Philosophy 1: Memory is the relationship',                      r: "Piku's entire value comes from remembering, connecting, and carrying context.", links: [] as Array<{ type: GraphNodeType; name: string; rel: GraphRelationship }> },
  { name: 'Philosophy 2: Presence over interface',                          r: 'Reduce chrome until what remains is presence.', links: [] },
  { name: 'Philosophy 3: Earn the right to interrupt',                      r: 'Silence is the default. Attention is the most expensive resource.', links: [] },
  { name: 'Philosophy 4: Continuity of being',                              r: 'Piku never resets to zero, never greets the user as a stranger.',
    links: [{ type: 'decision' as GraphNodeType, name: 'P1: Piku is not the model', rel: 'related_to' as GraphRelationship }] },
  { name: 'Philosophy 5: Privacy as intimacy',                              r: 'Data never leaves the machine without explicit user choice.',
    links: [
      { type: 'decision' as GraphNodeType, name: 'P4: Local-first always', rel: 'related_to' as GraphRelationship },
      { type: 'decision' as GraphNodeType, name: 'K4: No data leaves machine without user choice', rel: 'related_to' as GraphRelationship },
    ] },
  { name: 'Philosophy 6: Every consequential action reversible or confirmed', r: 'Piku never makes the user afraid of what it might do.',
    links: [
      { type: 'decision' as GraphNodeType, name: 'K5: Consequential actions require user confirmation', rel: 'related_to' as GraphRelationship },
      { type: 'decision' as GraphNodeType, name: 'K6: No World Model modification without user approval', rel: 'related_to' as GraphRelationship },
    ] },
  { name: 'Philosophy 7: The user is the author; Piku is the steward', r: "Piku holds, organizes, and advises — but the life is the user's, always.", links: [] },
]

// Step 4 part_of anchor lists
const ADR_NODES: Array<[GraphNodeType, string]> = [
  ['decision', 'Platform — macOS 12.0+ Only'],
  ['decision', 'Voice — Text First, Voice Later'],
  ['decision', 'Animation — 2D Canvas, Not 3D Engine'],
  ['decision', 'Invocation — ⌥ (Option) + Space Global Hotkey'],
  ['decision', 'Framework — Tauri (Rust + WebView)'],
  ['decision', 'Developer — Claude Code Primary'],
  ['decision', 'State Management — Frontend-Authoritative'],
  ['decision', 'Chat Response — Ollama (supersedes mock)'],
  ['decision', 'Persistence — IndexedDB (supersedes no-persistence)'],
  ['decision', 'Overlay — Full-Screen, Always-On-Top'],
  ['decision', 'Animation Performance — 60fps Target'],
  ['decision', 'Error Handling — Fail Gracefully'],
  ['decision', 'Feature Isolation — `src/features/<name>/`'],
  ['decision', 'mock'],
  ['decision', 'no-persistence'],
]

const PRINCIPLE_NODES: Array<[GraphNodeType, string]> = PRINCIPLES_DATA.map(p => ['decision', p.name])
const RULE_NODES: Array<[GraphNodeType, string]>      = RULES_DATA.map(r => ['decision', r.name])
const CONSTRAINT_NODES: Array<[GraphNodeType, string]> = CONSTRAINTS_DATA.map(k => ['decision', k.name])
const GOAL_NODES: Array<[GraphNodeType, string]> = [
  ['goal', 'Phase 1: Personal AI assistant'],
  ['goal', 'Phase 2: Persistent World Model depth'],
  ['goal', 'Phase 3: Ambient desktop companion'],
  ['goal', 'Phase 4: Proactive observer'],
  ['goal', 'Phase 5: Personal operating system layer'],
  ['goal', 'Phase 6: Autonomous execution + approval gate'],
  ['goal', NORTH_STAR_NAME],
]

// Step 5 isolated philosophy nodes (got part_of + semantic edges in Step 5)
const ISOLATED_PHILOSOPHY: Array<[GraphNodeType, string]> = [
  ['decision', 'Philosophy 1: Memory is the relationship'],
  ['decision', 'Philosophy 2: Presence over interface'],
  ['decision', 'Philosophy 3: Earn the right to interrupt'],
  ['decision', 'Philosophy 7: The user is the author; Piku is the steward'],
]

const TECH_CHOICE_NODES: Array<[GraphNodeType, string]> = TECH_CHOICES_DATA.map(
  c => ['decision', c.name] as [GraphNodeType, string],
)

// ── Architectural layer definitions (Step 5 corrected + Step 6 new) ────────────

// Step 5 original five — re-typed to 'concept' in Step 6
const STEP5_ARCH_LAYERS = [
  {
    name:      'Knowledge Graph',
    reasoning: 'The persistent, queryable structure of the World Model. Stores entities, relationships, and semantic embeddings across sessions and model upgrades. Built on IndexedDB. The graph is the architecture of what Piku knows — relationships are first-class data.',
    status:    'current',
  },
  {
    name:      'Observation Layer',
    reasoning: 'The passive intelligence layer that makes Piku aware of the user\'s world without manual explanation. Not yet built. Designed to observe git activity, file changes, IDE state, calendar, and email. Each observer implements ContextSource and registers with the Retrieval Layer.',
    status:    'planned',
  },
  {
    name:      'Model Orchestration',
    reasoning: 'The layer that manages all model inference. Routes all AI work through one interface. Model names appear nowhere else in the system. Currently: OllamaService with qwen3:14b (chat) and nomic-embed-text (embedding). Future: ProviderRegistry with capability-based routing.',
    status:    'current',
  },
  {
    name:      'Memory Layer',
    reasoning: 'The durable personal fact store. Extracts, embeds, deduplicates, and retrieves user-specific memories across 13 categories. Extraction runs fire-and-forget after every chat turn. Confidence-gated: confirmed ≥ 0.9, pending 0.5–0.89. All data stays local.',
    status:    'current',
  },
  {
    name:      'Retrieval Layer',
    reasoning: 'The unified World Model query interface. Fans out to all registered ContextSource implementations in parallel via Promise.allSettled(). Returns merged, deduplicated context fragments. New observers extend the system by implementing ContextSource. Currently: ProjectSource, MemorySource, GraphSource.',
    status:    'current',
  },
] as const

// Step 6 new — Learning Loop
const LEARNING_LOOP = {
  name:      'Learning Loop',
  reasoning: 'The self-improvement infrastructure of the World Model. Transforms experience into structured knowledge via PSPs (Problem Solving Patterns). Confidence-scored PSPs gain and lose confidence through Outcome tracking. Applies at four timescales: session, weeks, months, years. Supersession chains create an audit trail of evolved reasoning. Not yet implemented. Fully designed in OS §12.',
  status:    'planned',
} as const

// ── Test suite ─────────────────────────────────────────────────────────────────

describe.skip('GDD Phase 2 Step 6 — Schema Normalization + Leakage Fix + Learning Loop', () => {

  let beforeNodes = 0
  let beforeEdges = 0

  // ── Cumulative baseline: Steps 1–5 CORRECTED ─────────────────────────────

  beforeAll(async () => {
    // Step 1: ADR seeding
    const decisions = readFileSync(resolve(ROOT, SRC05), 'utf-8')
    await new DocumentSeeder().seedFromFile(decisions, SRC05, 'Piku Core', 'adr', 3)
    await syncMap()

    // Step 2: Principles, Rules, Tech nodes, Tech choices, Constraints
    for (const p of PRINCIPLES_DATA) {
      await seedNode('decision', p.name, { reasoning: p.r, status: 'active', category: 'principle', sourceDoc: SRC05 })
      if (p.te) await createEdge('decision', p.name, p.te.rel, 'technology', p.te.t)
    }
    for (const r of RULES_DATA) {
      await seedNode('decision', r.name, { reasoning: r.r, status: 'active', category: 'rule', sourceDoc: SRC05 })
      if (r.te) await createEdge('decision', r.name, r.te.rel, 'technology', r.te.t)
    }
    for (const t of TECH_NODES_DATA) {
      await seedNode('technology', t.name, { category: t.cat, sourceDoc: SRC05 })
    }
    for (const c of TECH_CHOICES_DATA) {
      await seedNode('decision', c.name, { reasoning: c.r, status: 'active', category: 'tech-choice', sourceDoc: SRC05 })
      for (const tech of c.techs) await createEdge('decision', c.name, 'uses', 'technology', tech)
    }
    for (const k of CONSTRAINTS_DATA) {
      await seedNode('decision', k.name, { reasoning: k.s, status: 'active', category: 'constraint', sourceDoc: SRC05 })
      if (k.te) await createEdge('decision', k.name, k.te.rel, 'technology', k.te.t)
    }

    // Step 3: Vision
    for (const p of PHASES_DATA) {
      await seedNode('goal', p.name, { description: p.desc, status: p.status, sourceDoc: SRC01 })
      for (const te of p.te) await createEdge('goal', p.name, te.r, 'technology', te.t)
      for (const adrName of p.ae) await createEdge('goal', p.name, 'related_to', 'decision', adrName)
    }
    const phaseNames = PHASES_DATA.map(p => p.name)
    for (let i = 0; i < phaseNames.length - 1; i++) {
      await createEdge('goal', phaseNames[i + 1], 'depends_on', 'goal', phaseNames[i])
    }
    await seedNode('goal', NORTH_STAR_NAME, { description: 'What is happening in my world right now?', status: 'mission', sourceDoc: SRC01 })
    await createEdge('goal', NORTH_STAR_NAME, 'related_to', 'goal', 'Phase 5: Personal operating system layer')
    for (const p of PHILOSOPHY_DATA) {
      await seedNode('decision', p.name, { reasoning: p.r, status: 'active', category: 'philosophy', sourceDoc: SRC01 })
      for (const lnk of p.links) await createEdge('decision', p.name, lnk.rel, lnk.type, lnk.name)
    }
    await syncMap()

    // Step 4: Ownership layer
    await seedNode('project', 'Piku Core', {
      status: 'active', category: 'product', source: 'canonical',
      description: 'Local-first ambient AI companion. The World Model is the product.',
    })
    await seedNode('person', 'Jaskirat Singh', { role: 'creator', relationship: 'owner' })
    await createEdge('project', 'Piku Core', 'owned_by', 'person', 'Jaskirat Singh')
    for (const [type, name] of [...ADR_NODES, ...PRINCIPLE_NODES, ...RULE_NODES, ...CONSTRAINT_NODES, ...GOAL_NODES]) {
      await createEdge(type, name, 'part_of', 'project', 'Piku Core')
    }
    await syncMap()

    // Step 5A: Philosophy anchoring + cross-edges + tech-choice anchoring + cross-layer tech edges
    for (const [type, name] of ISOLATED_PHILOSOPHY) {
      await createEdge(type, name, 'part_of', 'project', 'Piku Core')
    }
    await createEdge('decision', 'Philosophy 1: Memory is the relationship',                  'supports',   'decision', 'P2: The World Model is the product')
    await createEdge('decision', 'Philosophy 2: Presence over interface',                      'supports',   'goal',     'Phase 3: Ambient desktop companion')
    await createEdge('decision', 'Philosophy 2: Presence over interface',                      'related_to', 'decision', 'P5: Observation loop is the intended operating mode')
    await createEdge('decision', 'Philosophy 3: Earn the right to interrupt',                  'related_to', 'decision', 'K5: Consequential actions require user confirmation')
    await createEdge('decision', 'Philosophy 3: Earn the right to interrupt',                  'supports',   'goal',     'Phase 3: Ambient desktop companion')
    await createEdge('decision', 'Philosophy 7: The user is the author; Piku is the steward', 'supports',   'decision', 'P6: User approval gates all World Model writes')
    await createEdge('decision', 'Philosophy 7: The user is the author; Piku is the steward', 'related_to', 'decision', 'K6: No World Model modification without user approval')
    for (const [type, name] of TECH_CHOICE_NODES) {
      await createEdge(type, name, 'part_of', 'project', 'Piku Core')
    }
    await createEdge('technology', 'Tauri',     'supports', 'goal',     'Phase 3: Ambient desktop companion')
    await createEdge('technology', 'Ollama',    'supports', 'decision', 'K1: Zero recurring inference cost for core operations')
    await createEdge('technology', 'IndexedDB', 'supports', 'decision', 'K4: No data leaves machine without user choice')
    await createEdge('technology', 'Ollama',    'supports', 'goal',     'Phase 1: Personal AI assistant')
    await createEdge('technology', 'IndexedDB', 'supports', 'goal',     'Phase 1: Personal AI assistant')

    // Step 5B CORRECTED: architectural layer nodes — concept type (not decision), with domain, no leakage edges
    for (const layer of STEP5_ARCH_LAYERS) {
      await seedNode('concept', layer.name, {
        reasoning:  layer.reasoning,
        status:     layer.status,
        category:   'architectural-layer',
        domain:     'architecture',
        sourceDoc:  SRC_OS,
      })
      await createEdge('concept', layer.name, 'part_of', 'project', 'Piku Core')
    }

    // Knowledge Graph wiring (CORRECTED: implements ADR instead of related_to ADR + uses tech)
    await createEdge('concept', 'Knowledge Graph', 'implements', 'decision', 'Persistence — IndexedDB (supersedes no-persistence)')
    await createEdge('concept', 'Knowledge Graph', 'supports',   'decision', 'P2: The World Model is the product')

    // Observation Layer wiring
    await createEdge('concept', 'Observation Layer', 'implements', 'decision', 'P5: Observation loop is the intended operating mode')
    await createEdge('concept', 'Observation Layer', 'supports',   'goal',     'Phase 4: Proactive observer')
    await createEdge('concept', 'Observation Layer', 'related_to', 'goal',     'Phase 2: Persistent World Model depth')

    // Model Orchestration wiring (CORRECTED: implements ADR instead of uses Ollama)
    await createEdge('concept', 'Model Orchestration', 'implements', 'decision', 'Rule 1: Model names only in OllamaService.ts')
    await createEdge('concept', 'Model Orchestration', 'implements', 'decision', 'Chat Response — Ollama (supersedes mock)')
    await createEdge('concept', 'Model Orchestration', 'supports',   'decision', 'P3: Capability-based routing')
    await createEdge('concept', 'Model Orchestration', 'related_to', 'decision', 'K1: Zero recurring inference cost for core operations')

    // Memory Layer wiring (CORRECTED: implements ADR instead of uses IndexedDB)
    await createEdge('concept', 'Memory Layer', 'implements', 'decision', 'Persistence — IndexedDB (supersedes no-persistence)')
    await createEdge('concept', 'Memory Layer', 'related_to', 'decision', 'P6: User approval gates all World Model writes')
    await createEdge('concept', 'Memory Layer', 'related_to', 'decision', 'K6: No World Model modification without user approval')
    await createEdge('concept', 'Memory Layer', 'related_to', 'decision', 'K4: No data leaves machine without user choice')

    // Retrieval Layer wiring
    await createEdge('concept', 'Retrieval Layer', 'implements', 'decision', 'Rule 2: ContextSource is the extension interface')
    await createEdge('concept', 'Retrieval Layer', 'supports',   'decision', 'P2: The World Model is the product')
    await createEdge('concept', 'Retrieval Layer', 'related_to', 'decision', 'K4: No data leaves machine without user choice')

    await syncMap()

    const allNodes = await store.getAllNodes()
    const allEdges = await store.getAllEdges()
    beforeNodes = allNodes.length
    beforeEdges = allEdges.length

    console.log(`\n[Baseline — Steps 1+2+3+4+5 corrected] nodes=${beforeNodes} edges=${beforeEdges}`)
  }, 30_000)

  // ── Step 6: Learning Loop ─────────────────────────────────────────────────

  it('Step 6-1: creates Learning Loop as 6th architectural layer concept', async () => {
    await seedNode('concept', LEARNING_LOOP.name, {
      reasoning: LEARNING_LOOP.reasoning,
      status:    LEARNING_LOOP.status,
      category:  'architectural-layer',
      domain:    'architecture',
      sourceDoc: SRC_OS,
    })

    const allNodes = await store.getAllNodes()
    const ll = allNodes.find(n => n.name === LEARNING_LOOP.name)

    expect(ll).toBeDefined()
    expect(ll!.type).toBe('concept')
    expect(ll!.metadata['category']).toBe('architectural-layer')
    expect(ll!.metadata['domain']).toBe('architecture')

    console.log(`  ✓ Learning Loop [concept, planned, domain:architecture] created`)
  })

  it('Step 6-2: anchors Learning Loop via part_of → Piku Core', async () => {
    const ok = await createEdge('concept', 'Learning Loop', 'part_of', 'project', 'Piku Core')
    expect(ok).toBe(true)
    console.log('  ✓ Learning Loop → part_of → Piku Core')
  })

  it('Step 6-3: wires Learning Loop to constitutional anchors', async () => {
    // P2: the loop makes the World Model richer over time — its purpose
    const ok1 = await createEdge('concept', 'Learning Loop', 'related_to', 'decision', 'P2: The World Model is the product')
    // Phase 4: proactive intelligence requires the loop
    const ok2 = await createEdge('concept', 'Learning Loop', 'supports',   'goal',     'Phase 4: Proactive observer')
    // Phase 5: cross-app pattern recognition requires the loop
    const ok3 = await createEdge('concept', 'Learning Loop', 'related_to', 'goal',     'Phase 5: Personal operating system layer')
    // K5: PSP refinement proposals require user confirmation — the loop is constrained by K5
    const ok4 = await createEdge('concept', 'Learning Loop', 'related_to', 'decision', 'K5: Consequential actions require user confirmation')

    expect(ok1 && ok2 && ok3 && ok4).toBe(true)
    console.log('  ✓ Learning Loop: related_to P2, supports Phase 4, related_to Phase 5, related_to K5')
  })

  // ── Validation: schema changes ─────────────────────────────────────────────

  it('schema: all architectural layer nodes are concept type with domain=architecture', async () => {
    const allNodes = await store.getAllNodes()
    const archLayers = allNodes.filter(n => n.metadata?.['category'] === 'architectural-layer')

    const expectedNames = new Set([
      'Knowledge Graph', 'Observation Layer', 'Model Orchestration',
      'Memory Layer', 'Retrieval Layer', 'Learning Loop',
    ])

    const foundNames = new Set(archLayers.map(n => n.name))
    const allConcept = archLayers.every(n => n.type === 'concept')
    const allDomained = archLayers.every(n => n.metadata?.['domain'] === 'architecture')

    expect(archLayers.length).toBe(6)
    for (const name of expectedNames) {
      expect(foundNames.has(name), `${name} should exist as concept node`).toBe(true)
    }
    expect(allConcept, 'all architectural layer nodes must be concept type').toBe(true)
    expect(allDomained, 'all architectural layer nodes must have domain=architecture').toBe(true)

    console.log(`\n  ✓ All 6 architectural layers: concept type, domain=architecture`)
    for (const n of archLayers) {
      console.log(`    [${n.metadata['status']}] ${n.name}`)
    }
  })

  it('schema: no leakage edges — concept nodes do not use technologies directly', async () => {
    const allNodes = await store.getAllNodes()
    const allEdges = await store.getAllEdges()

    const conceptIds = new Set(allNodes.filter(n => n.type === 'concept').map(n => n.id))
    const techIds    = new Set(allNodes.filter(n => n.type === 'technology').map(n => n.id))

    const leakage = allEdges.filter(
      e => conceptIds.has(e.fromId) && techIds.has(e.toId) && e.relationship === 'uses'
    )

    expect(leakage.length, 'zero concept → uses → technology edges').toBe(0)
    console.log('  ✓ No leakage edges: concept nodes do not directly use technologies')
  })

  it('schema: replacement implements → ADR edges exist', async () => {
    const allEdges = await store.getAllEdges()
    const allNodes = await store.getAllNodes()
    const nodeById = new Map(allNodes.map(n => [n.id, n]))

    const kgId  = nameToId.get(nkey('concept', 'Knowledge Graph'))!
    const mlId  = nameToId.get(nkey('concept', 'Memory Layer'))!
    const moId  = nameToId.get(nkey('concept', 'Model Orchestration'))!

    const kgImplementsPersistence = allEdges.some(e =>
      e.fromId === kgId && e.relationship === 'implements' &&
      nodeById.get(e.toId)?.name.startsWith('Persistence')
    )
    const mlImplementsPersistence = allEdges.some(e =>
      e.fromId === mlId && e.relationship === 'implements' &&
      nodeById.get(e.toId)?.name.startsWith('Persistence')
    )
    const moImplementsChatResponse = allEdges.some(e =>
      e.fromId === moId && e.relationship === 'implements' &&
      nodeById.get(e.toId)?.name.startsWith('Chat Response')
    )

    expect(kgImplementsPersistence,  'Knowledge Graph → implements → Persistence ADR').toBe(true)
    expect(mlImplementsPersistence,  'Memory Layer → implements → Persistence ADR').toBe(true)
    expect(moImplementsChatResponse, 'Model Orchestration → implements → Chat Response ADR').toBe(true)

    console.log('  ✓ Replacement implements → ADR edges present for KG, ML, MO')
  })

  // ── Audit ─────────────────────────────────────────────────────────────────

  it('graph audit — step 6 delta', async () => {
    const allNodes = await store.getAllNodes()
    const allEdges = await store.getAllEdges()

    const byType: Record<string, number> = {}
    for (const n of allNodes) byType[n.type] = (byType[n.type] ?? 0) + 1

    const byCategory: Record<string, number> = {}
    for (const n of allNodes) {
      const cat = (n.metadata['category'] as string) ?? 'none'
      byCategory[cat] = (byCategory[cat] ?? 0) + 1
    }

    const edgeCounts: Record<string, number> = {}
    for (const e of allEdges) {
      edgeCounts[e.fromId] = (edgeCounts[e.fromId] ?? 0) + 1
      edgeCounts[e.toId]   = (edgeCounts[e.toId]   ?? 0) + 1
    }
    const isolated = allNodes.filter(n => (edgeCounts[n.id] ?? 0) === 0)

    const relCounts: Record<string, number> = {}
    for (const e of allEdges) relCounts[e.relationship] = (relCounts[e.relationship] ?? 0) + 1

    const sep = '─'.repeat(64)
    console.log(`\n${sep}`)
    console.log('  GRAPH AUDIT — GDD Phase 2 Step 6')
    console.log(sep)
    console.log(`\n  BASELINE (Steps 1+2+3+4+5 corrected): ${beforeNodes} nodes | ${beforeEdges} edges`)
    console.log(`  AFTER STEP 6: ${allNodes.length} nodes | ${allEdges.length} edges | ${isolated.length} isolated`)
    console.log(`  Delta: +${allNodes.length - beforeNodes} nodes | +${allEdges.length - beforeEdges} edges`)
    console.log(`\n  Node type distribution:`)
    for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${type.padEnd(12)} ${count}`)
    }
    console.log(`\n  Decision sub-categories:`)
    const dcats = ['adr', 'principle', 'rule', 'constraint', 'tech-choice', 'philosophy']
    for (const cat of dcats) {
      if (byCategory[cat]) console.log(`    ${cat.padEnd(22)} ${byCategory[cat]}`)
    }
    console.log(`\n  Concept sub-categories:`)
    if (byCategory['architectural-layer']) {
      console.log(`    architectural-layer    ${byCategory['architectural-layer']}`)
    }
    console.log(`\n  Relationship distribution:`)
    for (const [rel, count] of Object.entries(relCounts).sort((a, b) => b[1] - a[1])) {
      const bar = '█'.repeat(Math.round(count / 2))
      console.log(`    ${rel.padEnd(14)} ${String(count).padStart(3)}  ${bar}`)
    }
    console.log(sep)

    expect(allNodes.length).toBe(86)
    expect(allEdges.length).toBeGreaterThanOrEqual(147)
    expect(allEdges.length).toBeLessThanOrEqual(153)
    expect(isolated.length).toBe(0)
    expect(byType['concept']).toBe(6)
    expect(byType['decision']).toBe(51)
    expect(byType['technology']).toBe(20)
    expect(byType['goal']).toBe(7)
    expect(byType['project']).toBe(1)
    expect(byType['person']).toBe(1)
  })

  // ── Health review ──────────────────────────────────────────────────────────

  it('graph health review — final Step 6 state', async () => {
    const allNodes = await store.getAllNodes()
    const allEdges = await store.getAllEdges()

    const edgeCounts: Record<string, number> = {}
    for (const e of allEdges) {
      edgeCounts[e.fromId] = (edgeCounts[e.fromId] ?? 0) + 1
      edgeCounts[e.toId]   = (edgeCounts[e.toId]   ?? 0) + 1
    }

    const isolated   = allNodes.filter(n => (edgeCounts[n.id] ?? 0) === 0)
    const connected  = allNodes.length - isolated.length
    const avgEdges   = ((allEdges.length * 2) / allNodes.length).toFixed(1)
    const pikuCoreId = nameToId.get(nkey('project', 'Piku Core'))!
    const pikuEdges  = edgeCounts[pikuCoreId] ?? 0

    const whyFloor  = allNodes.filter(n => n.type === 'decision').length
    const howFloor  = allNodes.filter(n => n.type === 'concept').length
    const whatFloor = allNodes.filter(n => n.type === 'technology').length

    const topNodes = [...allNodes].sort((a, b) => (edgeCounts[b.id] ?? 0) - (edgeCounts[a.id] ?? 0)).slice(0, 5)

    const sep = '─'.repeat(64)
    console.log(`\n${sep}`)
    console.log('  GRAPH HEALTH — Post Step 6')
    console.log(sep)
    console.log(`\n  STRUCTURE:`)
    console.log(`    Total nodes:         ${allNodes.length}`)
    console.log(`    Total edges:         ${allEdges.length}`)
    console.log(`    Avg edges/node:      ${avgEdges}`)
    console.log(`    Isolated:            ${isolated.length}`)
    console.log(`    Connected:           ${connected}/${allNodes.length} (${(connected/allNodes.length*100).toFixed(1)}%)`)
    console.log(`    Node types in use:   9 (concept type added this step)`)
    console.log(`\n  GRAPH FLOORS:`)
    console.log(`    WHY  (decision — principles/ADRs/rules/constraints/philosophy): ${whyFloor}`)
    console.log(`    HOW  (concept — architectural layer concepts):                  ${howFloor}`)
    console.log(`    WHAT (technology — platforms, languages, frameworks):           ${whatFloor}`)
    console.log(`    DIRECTION (goal — phases + North Star):                         ${allNodes.filter(n => n.type === 'goal').length}`)
    console.log(`\n  ROOT ANCHOR: Piku Core ${pikuEdges} edges`)
    console.log(`\n  TOP 5 CONNECTED NODES:`)
    for (const n of topNodes) {
      console.log(`    ${String(edgeCounts[n.id]).padStart(3)} edges  [${n.type.padEnd(10)}]  ${n.name.slice(0, 50)}`)
    }
    console.log(sep)

    expect(allNodes.length).toBe(86)
    expect(isolated.length).toBe(0)
    expect(howFloor).toBe(6)
    expect(pikuEdges).toBeGreaterThan(60)
  })

})
