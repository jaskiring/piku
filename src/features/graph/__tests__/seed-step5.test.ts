/**
 * GDD Phase 2 Step 5 — Graph Coherence + Constitutional Architecture Layer
 *
 * Part A — Graph Coherence (0 new nodes, 25 new edges):
 *   • Anchor Philosophy 1, 2, 3, 7 via part_of → Piku Core  [resolves all isolation]
 *   • Add semantic cross-edges for Philosophy 1, 2, 3, 7     [7 edges]
 *   • Anchor 9 tech-choice decision nodes via part_of → Piku Core
 *   • Add cross-layer Technology → Goal/Constraint edges      [5 edges]
 *
 * Part B — Constitutional Architecture Layer (5 new nodes, 22 new edges):
 *   • Seed 5 architectural layer concepts drawn directly from OS v1.3:
 *       Knowledge Graph, Observation Layer, Model Orchestration,
 *       Memory Layer, Retrieval Layer
 *   • Node type: decision, category: architectural-layer
 *   • All receive part_of → Piku Core + principled cross-connections
 *
 * Why architectural concepts, not service classes:
 *   Service class names (WorldModelQueryService, OllamaService) are volatile —
 *   they change with every significant refactor. Architectural concepts (Knowledge
 *   Graph, Observation Layer) persist across every implementation rewrite. The
 *   World Model stores durable knowledge, not codebase file structure.
 *
 * Expected outcome: 85 nodes, ~145 edges, 0 isolated nodes
 *
 * Run: npx vitest run src/features/graph/__tests__/seed-step5.test.ts
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

// ── Shared infrastructure ──────────────────────────────────────────────────────

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
    console.warn(`  ⚠ edge skipped — node not found: "${fromName}" → ${rel} → "${toName}"`)
    return false
  }
  await graph.createEdge(fromId, toId, rel, confidence, 'confirmed')
  return true
}

async function syncMap() {
  const nodes = await store.getAllNodes()
  for (const n of nodes) nameToId.set(nkey(n.type as GraphNodeType, n.name), n.id)
}

function edgeCount(nodeId: string, allEdges: Awaited<ReturnType<GraphStore['getAllEdges']>>) {
  return allEdges.filter(e => e.fromId === nodeId || e.toId === nodeId).length
}

// ── Baseline data (Steps 1–4, re-seeded in beforeAll) ─────────────────────────

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
  { name: 'TypeScript',        cat: 'language'   },
  { name: 'TailwindCSS',       cat: 'framework'  },
  { name: 'nomic-embed-text',  cat: 'model'      },
  { name: 'qwen2.5-coder:14b', cat: 'model'      },
  { name: 'Framer Motion',     cat: 'framework'  },
  { name: 'Vitest',            cat: 'tool'       },
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
    te: [{ r: 'related_to' as GraphRelationship, t: 'Ollama' }, { r: 'related_to' as GraphRelationship, t: 'IndexedDB' }],
    ae: [] as string[] },
  { name: 'Phase 2: Persistent World Model depth',        desc: 'Git Observer, Repository entities.', status: 'next',   te: [], ae: [] },
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
  { name: 'Philosophy 2: Presence over interface',                          r: 'Reduce chrome until what remains is presence.',                                  links: [] },
  { name: 'Philosophy 3: Earn the right to interrupt',                      r: 'Silence is the default. Attention is the most expensive resource.',             links: [] },
  { name: 'Philosophy 4: Continuity of being',                              r: 'Piku never resets to zero, never greets the user as a stranger.',
    links: [{ type: 'decision' as GraphNodeType, name: 'P1: Piku is not the model', rel: 'related_to' as GraphRelationship }] },
  { name: 'Philosophy 5: Privacy as intimacy',                              r: 'Data never leaves the machine without explicit user choice.',
    links: [
      { type: 'decision' as GraphNodeType, name: 'P4: Local-first always',                       rel: 'related_to' as GraphRelationship },
      { type: 'decision' as GraphNodeType, name: 'K4: No data leaves machine without user choice', rel: 'related_to' as GraphRelationship },
    ] },
  { name: 'Philosophy 6: Every consequential action reversible or confirmed', r: 'Piku never makes the user afraid of what it might do.',
    links: [
      { type: 'decision' as GraphNodeType, name: 'K5: Consequential actions require user confirmation',   rel: 'related_to' as GraphRelationship },
      { type: 'decision' as GraphNodeType, name: 'K6: No World Model modification without user approval', rel: 'related_to' as GraphRelationship },
    ] },
  { name: 'Philosophy 7: The user is the author; Piku is the steward',      r: "Piku holds, organizes, and advises — but the life is the user's, always.",    links: [] },
]

// Step 4 node lists for part_of re-seeding
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

// ── Step 5 data ────────────────────────────────────────────────────────────────

// Part A: isolated philosophy nodes (4) — receive part_of + semantic edges
const ISOLATED_PHILOSOPHY: Array<[GraphNodeType, string]> = [
  ['decision', 'Philosophy 1: Memory is the relationship'],
  ['decision', 'Philosophy 2: Presence over interface'],
  ['decision', 'Philosophy 3: Earn the right to interrupt'],
  ['decision', 'Philosophy 7: The user is the author; Piku is the steward'],
]

// Part A: floating tech-choice nodes (9) — receive part_of edges only
const TECH_CHOICE_NODES: Array<[GraphNodeType, string]> = TECH_CHOICES_DATA.map(
  c => ['decision', c.name] as [GraphNodeType, string],
)

// Part B: constitutional architectural layer concepts (OS v1.3)
const ARCH_LAYERS = [
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

// ── Test suite ─────────────────────────────────────────────────────────────────

describe.skip('GDD Phase 2 Step 5 — Graph Coherence + Constitutional Architecture Layer', () => {

  let beforeNodes = 0
  let beforeEdges = 0
  let beforeIsolated: string[] = []

  // ── Re-seed Steps 1–4 as cumulative baseline ──────────────────────────────

  beforeAll(async () => {
    // Step 1: ADR seeding via DocumentSeeder
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

    // Step 3: Vision — phases, North Star, philosophy
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

    const allNodes = await store.getAllNodes()
    const allEdges = await store.getAllEdges()
    beforeNodes   = allNodes.length
    beforeEdges   = allEdges.length
    beforeIsolated = allNodes
      .filter(n => edgeCount(n.id, allEdges) === 0)
      .map(n => `[${n.type}] ${n.name}`)

    console.log(`\n[Baseline — Steps 1+2+3+4] nodes=${beforeNodes} edges=${beforeEdges} isolated=${beforeIsolated.length}`)
    for (const iso of beforeIsolated) console.log(`  • ${iso}`)
  }, 30_000)

  // ── Part A-1: Anchor isolated Philosophy nodes ─────────────────────────────

  it('Part A-1: anchors Philosophy 1, 2, 3, 7 via part_of → Piku Core', async () => {
    let created = 0
    for (const [type, name] of ISOLATED_PHILOSOPHY) {
      const ok = await createEdge(type, name, 'part_of', 'project', 'Piku Core')
      if (ok) created++
    }
    expect(created).toBe(ISOLATED_PHILOSOPHY.length)
    console.log(`  ✓ Philosophy isolation resolved: ${created}/4 part_of edges created`)
  })

  // ── Part A-2: Semantic cross-edges for Philosophy 1, 2, 3, 7 ──────────────

  it('Part A-2: adds semantic cross-edges connecting isolated philosophy to principles/goals', async () => {
    type CrossEdge = { from: string; rel: GraphRelationship; toType: GraphNodeType; to: string }
    const cross: CrossEdge[] = [
      // Phil 1: memory IS the World Model — connects to P2 (World Model Primacy)
      { from: 'Philosophy 1: Memory is the relationship',                  rel: 'supports',   toType: 'decision', to: 'P2: The World Model is the product' },
      // Phil 2: presence philosophy → Phase 3 (ambient companion) and P5 (observation loop)
      { from: 'Philosophy 2: Presence over interface',                      rel: 'supports',   toType: 'goal',     to: 'Phase 3: Ambient desktop companion' },
      { from: 'Philosophy 2: Presence over interface',                      rel: 'related_to', toType: 'decision', to: 'P5: Observation loop is the intended operating mode' },
      // Phil 3: earning the right to interrupt → confirmation constraint and ambient goal
      { from: 'Philosophy 3: Earn the right to interrupt',                  rel: 'related_to', toType: 'decision', to: 'K5: Consequential actions require user confirmation' },
      { from: 'Philosophy 3: Earn the right to interrupt',                  rel: 'supports',   toType: 'goal',     to: 'Phase 3: Ambient desktop companion' },
      // Phil 7: user as author → approval principle and modification constraint
      { from: 'Philosophy 7: The user is the author; Piku is the steward', rel: 'supports',   toType: 'decision', to: 'P6: User approval gates all World Model writes' },
      { from: 'Philosophy 7: The user is the author; Piku is the steward', rel: 'related_to', toType: 'decision', to: 'K6: No World Model modification without user approval' },
    ]

    let created = 0
    for (const e of cross) {
      const ok = await createEdge('decision', e.from, e.rel, e.toType, e.to)
      if (ok) created++
    }
    expect(created).toBe(cross.length)
    console.log(`  ✓ Philosophy semantic cross-edges: ${created}/7 created`)
  })

  // ── Part A-3: Anchor floating tech-choice subgraph ────────────────────────

  it('Part A-3: anchors all 9 tech-choice decision nodes via part_of → Piku Core', async () => {
    let created = 0
    for (const [type, name] of TECH_CHOICE_NODES) {
      const ok = await createEdge(type, name, 'part_of', 'project', 'Piku Core')
      if (ok) created++
    }
    expect(created).toBe(TECH_CHOICE_NODES.length)
    console.log(`  ✓ Tech-choice anchors: ${created}/9 part_of edges created`)
  })

  // ── Part A-4: Cross-layer Technology → Goal/Constraint edges ──────────────

  it('Part A-4: adds cross-layer Technology → Goal and Technology → Constraint edges', async () => {
    type TechEdge = { from: string; rel: GraphRelationship; toType: GraphNodeType; to: string }
    const techEdges: TechEdge[] = [
      // Tauri is the technology that enables Phase 3's ambient presence (hotkey + tray + overlay)
      { from: 'Tauri',     rel: 'supports', toType: 'goal',     to: 'Phase 3: Ambient desktop companion' },
      // Ollama local inference is the reason K1 (zero recurring cost) is achievable
      { from: 'Ollama',    rel: 'supports', toType: 'decision', to: 'K1: Zero recurring inference cost for core operations' },
      // IndexedDB local storage is how K4 (data stays on machine) is satisfied
      { from: 'IndexedDB', rel: 'supports', toType: 'decision', to: 'K4: No data leaves machine without user choice' },
      // Ollama + IndexedDB together enable Phase 1 (the current working product)
      { from: 'Ollama',    rel: 'supports', toType: 'goal',     to: 'Phase 1: Personal AI assistant' },
      { from: 'IndexedDB', rel: 'supports', toType: 'goal',     to: 'Phase 1: Personal AI assistant' },
    ]

    let created = 0
    for (const e of techEdges) {
      const ok = await createEdge('technology', e.from, e.rel, e.toType, e.to)
      if (ok) created++
    }
    expect(created).toBe(techEdges.length)
    console.log(`  ✓ Cross-layer tech→goal/constraint edges: ${created}/5 created`)
  })

  // ── Part B-1: Create architectural layer concept nodes ────────────────────

  it('Part B-1: creates 5 architectural layer concept nodes (decision, category: architectural-layer)', async () => {
    for (const layer of ARCH_LAYERS) {
      await seedNode('decision', layer.name, {
        reasoning:  layer.reasoning,
        status:     layer.status,
        category:   'architectural-layer',
        sourceDoc:  SRC_OS,
      })
    }

    const allNodes = await store.getAllNodes()
    const layerNames = new Set<string>(ARCH_LAYERS.map(l => l.name))
    const found = allNodes.filter(n => layerNames.has(n.name))

    expect(found.length).toBe(ARCH_LAYERS.length)
    expect(found.every(n => n.type === 'decision')).toBe(true)
    expect(found.every(n => n.metadata['category'] === 'architectural-layer')).toBe(true)

    console.log(`  ✓ Architectural layer nodes created: ${found.length}/5`)
    for (const n of found) {
      console.log(`    [${n.metadata['status']}] ${n.name}`)
    }
  })

  // ── Part B-2: Anchor all architectural layers ─────────────────────────────

  it('Part B-2: anchors all 5 architectural layers via part_of → Piku Core', async () => {
    let created = 0
    for (const layer of ARCH_LAYERS) {
      const ok = await createEdge('decision', layer.name, 'part_of', 'project', 'Piku Core')
      if (ok) created++
    }
    expect(created).toBe(ARCH_LAYERS.length)
    console.log(`  ✓ Architectural layer anchors: ${created}/5 part_of edges created`)
  })

  // ── Part B-3–7: Cross-connections for each architectural layer ─────────────

  it('Part B-3: Knowledge Graph — wired to ADR-009, IndexedDB, and P2', async () => {
    // Knowledge Graph is governed by the persistence decision, uses IndexedDB, and IS the structure of P2
    const ok1 = await createEdge('decision', 'Knowledge Graph', 'related_to', 'decision', 'Persistence — IndexedDB (supersedes no-persistence)')
    const ok2 = await createEdge('decision', 'Knowledge Graph', 'uses',       'technology', 'IndexedDB')
    const ok3 = await createEdge('decision', 'Knowledge Graph', 'supports',   'decision', 'P2: The World Model is the product')
    expect(ok1 && ok2 && ok3).toBe(true)
    console.log('  ✓ Knowledge Graph: related_to ADR-009, uses IndexedDB, supports P2')
  })

  it('Part B-4: Observation Layer — wired to P5, Phase 4, Phase 2', async () => {
    // Observation Layer IS the implementation of P5; enables Phase 4; Phase 2 starts building it
    const ok1 = await createEdge('decision', 'Observation Layer', 'implements', 'decision', 'P5: Observation loop is the intended operating mode')
    const ok2 = await createEdge('decision', 'Observation Layer', 'supports',   'goal',     'Phase 4: Proactive observer')
    const ok3 = await createEdge('decision', 'Observation Layer', 'related_to', 'goal',     'Phase 2: Persistent World Model depth')
    expect(ok1 && ok2 && ok3).toBe(true)
    console.log('  ✓ Observation Layer: implements P5, supports Phase 4, related_to Phase 2')
  })

  it('Part B-5: Model Orchestration — wired to Rule 1, P3, Ollama, K1', async () => {
    // Model Orchestration IS what Rule 1 describes; supports the P3 design; uses Ollama; enables K1
    const ok1 = await createEdge('decision', 'Model Orchestration', 'implements', 'decision',   'Rule 1: Model names only in OllamaService.ts')
    const ok2 = await createEdge('decision', 'Model Orchestration', 'supports',   'decision',   'P3: Capability-based routing')
    const ok3 = await createEdge('decision', 'Model Orchestration', 'uses',       'technology', 'Ollama')
    const ok4 = await createEdge('decision', 'Model Orchestration', 'related_to', 'decision',   'K1: Zero recurring inference cost for core operations')
    expect(ok1 && ok2 && ok3 && ok4).toBe(true)
    console.log('  ✓ Model Orchestration: implements Rule 1, supports P3, uses Ollama, related_to K1')
  })

  it('Part B-6: Memory Layer — wired to P6, K6, IndexedDB, K4', async () => {
    // Memory Layer is where approval-gated writes and local storage constraints are enacted
    const ok1 = await createEdge('decision', 'Memory Layer', 'related_to', 'decision',   'P6: User approval gates all World Model writes')
    const ok2 = await createEdge('decision', 'Memory Layer', 'related_to', 'decision',   'K6: No World Model modification without user approval')
    const ok3 = await createEdge('decision', 'Memory Layer', 'uses',       'technology', 'IndexedDB')
    const ok4 = await createEdge('decision', 'Memory Layer', 'related_to', 'decision',   'K4: No data leaves machine without user choice')
    expect(ok1 && ok2 && ok3 && ok4).toBe(true)
    console.log('  ✓ Memory Layer: related_to P6/K6, uses IndexedDB, related_to K4')
  })

  it('Part B-7: Retrieval Layer — wired to Rule 2, P2, K4', async () => {
    // Retrieval Layer IS the implementation of Rule 2 (ContextSource); serves P2; stays local (K4)
    const ok1 = await createEdge('decision', 'Retrieval Layer', 'implements', 'decision', 'Rule 2: ContextSource is the extension interface')
    const ok2 = await createEdge('decision', 'Retrieval Layer', 'supports',   'decision', 'P2: The World Model is the product')
    const ok3 = await createEdge('decision', 'Retrieval Layer', 'related_to', 'decision', 'K4: No data leaves machine without user choice')
    expect(ok1 && ok2 && ok3).toBe(true)
    console.log('  ✓ Retrieval Layer: implements Rule 2, supports P2, related_to K4')
  })

  // ── Audit: before / after ──────────────────────────────────────────────────

  it('graph audit — delta, isolation, category breakdown', async () => {
    const allNodes = await store.getAllNodes()
    const allEdges = await store.getAllEdges()

    const edgeCounts: Record<string, number> = {}
    for (const e of allEdges) {
      edgeCounts[e.fromId] = (edgeCounts[e.fromId] ?? 0) + 1
      edgeCounts[e.toId]   = (edgeCounts[e.toId]   ?? 0) + 1
    }
    const nowIsolated = allNodes.filter(n => (edgeCounts[n.id] ?? 0) === 0)

    const byType: Record<string, number> = {}
    for (const n of allNodes) byType[n.type] = (byType[n.type] ?? 0) + 1

    const byCategory: Record<string, number> = {}
    for (const n of allNodes) {
      const cat = (n.metadata['category'] as string) ?? 'none'
      byCategory[cat] = (byCategory[cat] ?? 0) + 1
    }

    const sep = '─'.repeat(64)
    console.log(`\n${sep}`)
    console.log('  GRAPH AUDIT — GDD Phase 2 Step 5')
    console.log(sep)
    console.log(`\n  BEFORE:  ${beforeNodes} nodes  |  ${beforeEdges} edges  |  ${beforeIsolated.length} isolated`)
    console.log(`  AFTER:   ${allNodes.length} nodes  |  ${allEdges.length} edges  |  ${nowIsolated.length} isolated`)
    console.log(`  Delta:   +${allNodes.length - beforeNodes} nodes  |  +${allEdges.length - beforeEdges} edges  |  ${beforeIsolated.length - nowIsolated.length} de-isolated`)
    console.log(`\n  Nodes by type:`)
    for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${type.padEnd(14)} ${count}`)
    }
    console.log(`\n  Decision nodes by category:`)
    const catOrder = ['adr', 'principle', 'rule', 'constraint', 'tech-choice', 'philosophy', 'architectural-layer']
    for (const cat of catOrder) {
      if (byCategory[cat]) console.log(`    ${cat.padEnd(22)} ${byCategory[cat]}`)
    }
    console.log(`\n  Isolated BEFORE (${beforeIsolated.length}):`)
    for (const n of beforeIsolated) console.log(`    • ${n}`)
    console.log(`\n  Isolated AFTER (${nowIsolated.length}):`)
    if (nowIsolated.length === 0) {
      console.log('    None — all nodes connected')
    } else {
      for (const n of nowIsolated) console.log(`    • [${n.type}] ${n.name}`)
    }
    console.log(sep)

    expect(allNodes.length).toBe(beforeNodes + ARCH_LAYERS.length)    // +5 arch layer nodes
    expect(allEdges.length - beforeEdges).toBeGreaterThanOrEqual(40)  // at least 40 new edges
    expect(allEdges.length - beforeEdges).toBeLessThanOrEqual(52)     // sanity upper bound
    expect(nowIsolated.length).toBe(0)                                // zero isolated
    expect(byCategory['architectural-layer']).toBe(5)                 // 5 arch layer nodes
  })

  // ── Traversal: three-floor paths ───────────────────────────────────────────

  it('traversal — three-floor paths exist (WHY → HOW → WHAT)', async () => {
    const allNodes = await store.getAllNodes()
    const allEdges = await store.getAllEdges()
    const nodeById = new Map(allNodes.map(n => [n.id, n]))
    const pikuCoreId = nameToId.get(nkey('project', 'Piku Core'))!

    // Floor HOW: architectural layers reachable from Piku Core
    const pikulChildren = allEdges
      .filter(e => e.toId === pikuCoreId && e.relationship === 'part_of')
      .map(e => nodeById.get(e.fromId)!)
      .filter(Boolean)
    const archLayers = pikulChildren.filter(n => n.metadata?.['category'] === 'architectural-layer')

    // Floor WHY: principles/rules/constraints reachable from arch layers
    const layerIds = new Set(archLayers.map(n => n.id))
    const layerOutEdges = allEdges.filter(e => layerIds.has(e.fromId))
    const principlesFromLayers = layerOutEdges
      .map(e => nodeById.get(e.toId)!)
      .filter(Boolean)
      .filter(n => n.type === 'decision' && ['principle', 'rule', 'constraint'].includes(n.metadata?.['category'] as string))

    // Floor WHAT: technologies reachable from arch layers
    const techsFromLayers = layerOutEdges
      .map(e => nodeById.get(e.toId)!)
      .filter(Boolean)
      .filter(n => n.type === 'technology')

    // Specific path: Knowledge Graph → uses → IndexedDB
    const kgId = nameToId.get(nkey('decision', 'Knowledge Graph'))!
    const kgEdges = allEdges.filter(e => e.fromId === kgId)
    const kgUsesIndexedDB = kgEdges.some(e => {
      const t = nodeById.get(e.toId)
      return e.relationship === 'uses' && t?.name === 'IndexedDB'
    })
    const kgRelatedADR = kgEdges.some(e => {
      const t = nodeById.get(e.toId)
      return e.relationship === 'related_to' && t?.name.startsWith('Persistence')
    })

    // Specific path: Model Orchestration → implements → Rule 1
    const moId = nameToId.get(nkey('decision', 'Model Orchestration'))!
    const moImplementsRule1 = allEdges.some(e => {
      const t = nodeById.get(e.toId)
      return e.fromId === moId && e.relationship === 'implements' && t?.name.startsWith('Rule 1')
    })

    // Specific path: Retrieval Layer → implements → Rule 2
    const rlId = nameToId.get(nkey('decision', 'Retrieval Layer'))!
    const rlImplementsRule2 = allEdges.some(e => {
      const t = nodeById.get(e.toId)
      return e.fromId === rlId && e.relationship === 'implements' && t?.name.startsWith('Rule 2')
    })

    // Specific path: Philosophy 1 → supports → P2 AND part_of → Piku Core
    const phil1Id = nameToId.get(nkey('decision', 'Philosophy 1: Memory is the relationship'))!
    const phil1SupportsP2    = allEdges.some(e => { const t = nodeById.get(e.toId); return e.fromId === phil1Id && e.relationship === 'supports' && t?.name.startsWith('P2:') })
    const phil1PartOfCore    = allEdges.some(e => e.fromId === phil1Id && e.toId === pikuCoreId && e.relationship === 'part_of')

    // Specific path: Tauri → supports → Phase 3
    const tauriId = nameToId.get(nkey('technology', 'Tauri'))!
    const tauriSupportsPhase3 = allEdges.some(e => {
      const t = nodeById.get(e.toId)
      return e.fromId === tauriId && e.relationship === 'supports' && t?.name.startsWith('Phase 3')
    })

    const sep = '─'.repeat(64)
    console.log(`\n${sep}`)
    console.log('  TRAVERSAL VALIDATION — Three-Floor Graph Paths')
    console.log(sep)
    console.log(`\n  HOW floor: Architectural layers reachable from Piku Core`)
    console.log(`    ${archLayers.length}/5 layers reachable`)
    for (const l of archLayers.sort((a, b) => a.name.localeCompare(b.name))) {
      console.log(`    • ${l.name} [${l.metadata?.['status']}]`)
    }
    console.log(`\n  WHY floor: Principles/rules/constraints reachable from arch layers`)
    const uniquePrinciples = [...new Set(principlesFromLayers.map(n => n.name))]
    console.log(`    ${uniquePrinciples.length} unique principle/rule/constraint nodes`)
    for (const name of uniquePrinciples.slice(0, 6)) console.log(`    • ${name}`)
    console.log(`\n  WHAT floor: Technologies reachable from arch layers`)
    const uniqueTechs = [...new Set(techsFromLayers.map(n => n.name))]
    console.log(`    ${uniqueTechs.length} unique technology nodes: ${uniqueTechs.join(', ')}`)
    console.log(`\n  Path spot-checks:`)
    console.log(`    Knowledge Graph → uses → IndexedDB:            ${kgUsesIndexedDB   ? '✓' : '✗'}`)
    console.log(`    Knowledge Graph → related_to → ADR-009:        ${kgRelatedADR      ? '✓' : '✗'}`)
    console.log(`    Model Orchestration → implements → Rule 1:     ${moImplementsRule1 ? '✓' : '✗'}`)
    console.log(`    Retrieval Layer → implements → Rule 2:         ${rlImplementsRule2 ? '✓' : '✗'}`)
    console.log(`    Philosophy 1 → supports → P2:                  ${phil1SupportsP2   ? '✓' : '✗'}`)
    console.log(`    Philosophy 1 → part_of → Piku Core:            ${phil1PartOfCore   ? '✓' : '✗'}`)
    console.log(`    Tauri → supports → Phase 3:                    ${tauriSupportsPhase3 ? '✓' : '✗'}`)
    console.log(sep)

    expect(archLayers.length).toBe(5)
    expect(uniquePrinciples.length).toBeGreaterThan(3)
    expect(uniqueTechs.length).toBeGreaterThan(0)
    expect(kgUsesIndexedDB).toBe(true)
    expect(kgRelatedADR).toBe(true)
    expect(moImplementsRule1).toBe(true)
    expect(rlImplementsRule2).toBe(true)
    expect(phil1SupportsP2).toBe(true)
    expect(phil1PartOfCore).toBe(true)
    expect(tauriSupportsPhase3).toBe(true)
  })

  // ── Health review ──────────────────────────────────────────────────────────

  it('graph health review — final state', async () => {
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

    const relCounts: Record<string, number> = {}
    for (const e of allEdges) relCounts[e.relationship] = (relCounts[e.relationship] ?? 0) + 1

    const topNodes = [...allNodes]
      .sort((a, b) => (edgeCounts[b.id] ?? 0) - (edgeCounts[a.id] ?? 0))
      .slice(0, 5)

    const byType: Record<string, number> = {}
    for (const n of allNodes) byType[n.type] = (byType[n.type] ?? 0) + 1

    const whyFloor  = allNodes.filter(n => n.type === 'decision' && n.metadata?.['category'] !== 'architectural-layer').length
    const howFloor  = allNodes.filter(n => n.metadata?.['category'] === 'architectural-layer').length
    const whatFloor = allNodes.filter(n => n.type === 'technology').length

    const sep = '─'.repeat(64)
    console.log(`\n${sep}`)
    console.log('  GRAPH HEALTH — Post Step 5')
    console.log(sep)
    console.log(`\n  STRUCTURE:`)
    console.log(`    Total nodes:         ${allNodes.length}`)
    console.log(`    Total edges:         ${allEdges.length}`)
    console.log(`    Avg edges/node:      ${avgEdges}`)
    console.log(`    Isolated nodes:      ${isolated.length}`)
    console.log(`    Connected:           ${connected}/${allNodes.length} (${(connected / allNodes.length * 100).toFixed(1)}%)`)
    console.log(`\n  ROOT ANCHOR:`)
    console.log(`    Piku Core [project]: ${pikuEdges} edges (${pikuEdges - 1} part_of incoming + 1 owned_by outgoing)`)
    console.log(`\n  GRAPH FLOORS:`)
    console.log(`    WHY  (principles/ADRs/rules/constraints/philosophy): ${whyFloor}`)
    console.log(`    HOW  (architectural layer concepts):                 ${howFloor}`)
    console.log(`    WHAT (technology nodes):                             ${whatFloor}`)
    console.log(`    GOALS (phases + North Star):                         ${byType['goal'] ?? 0}`)
    console.log(`\n  RELATIONSHIP DISTRIBUTION:`)
    for (const [rel, count] of Object.entries(relCounts).sort((a, b) => b[1] - a[1])) {
      const bar = '█'.repeat(Math.round(count / 2))
      console.log(`    ${rel.padEnd(14)} ${String(count).padStart(3)}  ${bar}`)
    }
    console.log(`\n  TOP 5 CONNECTED NODES:`)
    for (const n of topNodes) {
      console.log(`    ${String(edgeCounts[n.id] ?? 0).padStart(3)} edges  [${n.type.padEnd(10)}]  ${n.name.slice(0, 50)}`)
    }
    console.log(sep)

    // Final health assertions
    expect(allNodes.length).toBe(85)
    expect(allEdges.length).toBeGreaterThanOrEqual(140)
    expect(allEdges.length).toBeLessThanOrEqual(152)
    expect(isolated.length).toBe(0)
    expect(pikuEdges).toBeGreaterThan(55)  // 42 step4 + 4 phil + 9 tech-choice + 5 arch = 61 incoming + 1 owned_by
    expect(howFloor).toBe(5)
    expect(whyFloor).toBe(51)              // 51 original decision nodes (excludes architectural-layer category)
    expect(byType['decision']).toBe(56)    // 51 + 5 arch layers = 56 total decision-type nodes
    expect(byType['technology']).toBe(20)
    expect(byType['goal']).toBe(7)
    expect(byType['project']).toBe(1)
    expect(byType['person']).toBe(1)
  })

})
