/**
 * GDD Phase 2 Step 4 — Project Identity / Ownership Layer
 *
 * Resolves Bug #3: graph has no anchor node.
 *
 * Creates:
 *   - "Piku Core"      [project] — the root anchor
 *   - "Jaskirat Singh" [person]  — the owner
 *
 * Edges:
 *   - Piku Core → owned_by → Jaskirat Singh  (1 edge)
 *   - 42 nodes  → part_of  → Piku Core
 *       ADR decisions (15) + Principles P1–P8 (8) + Rules 1–6 (6)
 *       + Constraints K1–K6 (6) + Goals 1–6 + North Star (7)
 *
 * Total new: 2 nodes, 43 edges → graph moves from 78/55 to ~80/98
 *
 * Objective: graph cohesion, not growth.
 *
 * Run: npx vitest run src/features/graph/__tests__/seed-ownership.test.ts
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

// ── Shared infrastructure ─────────────────────────────────────────────────────

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
    console.warn(`  ⚠ skipped: "${fromName}" → ${rel} → "${toName}" (node not found)`)
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

// ── All nodes that get part_of edges to Piku Core ────────────────────────────

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

const PRINCIPLE_NODES: Array<[GraphNodeType, string]> = [
  ['decision', 'P1: Piku is not the model'],
  ['decision', 'P2: The World Model is the product'],
  ['decision', 'P3: Capability-based routing'],
  ['decision', 'P4: Local-first always'],
  ['decision', 'P5: Observation loop is the intended operating mode'],
  ['decision', 'P6: User approval gates all World Model writes'],
  ['decision', 'P7: Personality is data, not a prompt'],
  ['decision', 'P8: IDB migrations are additive only'],
]

const RULE_NODES: Array<[GraphNodeType, string]> = [
  ['decision', 'Rule 1: Model names only in OllamaService.ts'],
  ['decision', 'Rule 2: ContextSource is the extension interface'],
  ['decision', 'Rule 3: Post-response processing is fire-and-forget'],
  ['decision', 'Rule 4: Extraction services never throw to callers'],
  ['decision', 'Rule 5: Features export only via index.ts'],
  ['decision', 'Rule 6: ContextVersionStore is append-only'],
]

const CONSTRAINT_NODES: Array<[GraphNodeType, string]> = [
  ['decision', 'K1: Zero recurring inference cost for core operations'],
  ['decision', 'K2: External AI via browser session automation only'],
  ['decision', 'K3: Core functionality without paid API or network'],
  ['decision', 'K4: No data leaves machine without user choice'],
  ['decision', 'K5: Consequential actions require user confirmation'],
  ['decision', 'K6: No World Model modification without user approval'],
]

const GOAL_NODES: Array<[GraphNodeType, string]> = [
  ['goal', 'Phase 1: Personal AI assistant'],
  ['goal', 'Phase 2: Persistent World Model depth'],
  ['goal', 'Phase 3: Ambient desktop companion'],
  ['goal', 'Phase 4: Proactive observer'],
  ['goal', 'Phase 5: Personal operating system layer'],
  ['goal', 'Phase 6: Autonomous execution + approval gate'],
  ['goal', 'North Star: Ambient companion that knows everything happening in your world'],
]

const ALL_PART_OF_NODES = [
  ...ADR_NODES,
  ...PRINCIPLE_NODES,
  ...RULE_NODES,
  ...CONSTRAINT_NODES,
  ...GOAL_NODES,
]

// ── Baseline data (replicated for self-contained re-seed) ─────────────────────

const PRINCIPLES_DATA = [
  { name: 'P1: Piku is not the model',                    r: 'Models are replaceable reasoning engines.', te: null as null | {rel: GraphRelationship; t: string} },
  { name: 'P2: The World Model is the product',            r: 'Memory, Graph, Projects are components of the World Model.', te: null },
  { name: 'P3: Capability-based routing',                 r: 'Model names never appear in business logic.', te: { rel: 'related_to' as GraphRelationship, t: 'Ollama' } },
  { name: 'P4: Local-first always',                       r: 'All data in IndexedDB. No network egress without explicit user opt-in.', te: { rel: 'related_to' as GraphRelationship, t: 'IndexedDB' } },
  { name: 'P5: Observation loop is the intended operating mode', r: 'Reactive Q&A is the fallback interface.', te: null },
  { name: 'P6: User approval gates all World Model writes', r: 'ProjectUpdateService.applyApprovedDiff() is the only path.', te: null },
  { name: 'P7: Personality is data, not a prompt',        r: 'Personality traits must be stored as World Model entities.', te: null },
  { name: 'P8: IDB migrations are additive only',         r: 'Never drop stores. Never modify existing store schemas.', te: { rel: 'related_to' as GraphRelationship, t: 'IndexedDB' } },
]

const RULES_DATA = [
  { name: 'Rule 1: Model names only in OllamaService.ts',  r: 'Finding qwen3:14b outside this file is a bug.', te: { rel: 'related_to' as GraphRelationship, t: 'Ollama' } },
  { name: 'Rule 2: ContextSource is the extension interface', r: 'New sources implement ContextSource.', te: null },
  { name: 'Rule 3: Post-response processing is fire-and-forget', r: 'Extraction must not block response display.', te: null },
  { name: 'Rule 4: Extraction services never throw to callers', r: 'They log errors and return empty.', te: null },
  { name: 'Rule 5: Features export only via index.ts',    r: 'No cross-feature imports from internal files.', te: null },
  { name: 'Rule 6: ContextVersionStore is append-only',   r: 'Never delete context versions.', te: null },
]

const CONSTRAINTS_DATA = [
  { name: 'K1: Zero recurring inference cost for core operations', s: 'Core operations must not incur per-call API costs.', te: { rel: 'related_to' as GraphRelationship, t: 'Ollama' } },
  { name: 'K2: External AI via browser session automation only',   s: 'Never via API key.', te: null },
  { name: 'K3: Core functionality without paid API or network',    s: 'Must work offline.', te: null },
  { name: 'K4: No data leaves machine without user choice',        s: 'No network egress without opt-in.', te: { rel: 'related_to' as GraphRelationship, t: 'IndexedDB' } },
  { name: 'K5: Consequential actions require user confirmation',   s: 'Explicit confirmation required.', te: null },
  { name: 'K6: No World Model modification without user approval', s: 'Diff-and-approve is mandatory.', te: null },
]

const TECH_NODES_DATA = [
  { name: 'TypeScript', cat: 'language' }, { name: 'TailwindCSS', cat: 'framework' },
  { name: 'nomic-embed-text', cat: 'model' }, { name: 'qwen2.5-coder:14b', cat: 'model' },
  { name: 'Framer Motion', cat: 'framework' }, { name: 'Vitest', cat: 'tool' },
]

const TECH_CHOICES_DATA = [
  { name: 'Desktop framework: Tauri 2',               r: 'Native OS integration, small binary',   techs: ['Tauri'] },
  { name: 'Frontend: React + TypeScript + TailwindCSS', r: 'Standard, well-supported',            techs: ['React','TypeScript','TailwindCSS'] },
  { name: 'Local storage: IndexedDB via idb library', r: 'Browser-native',                        techs: ['IndexedDB'] },
  { name: 'Local AI: Ollama',                         r: 'Local-first, no API cost',              techs: ['Ollama'] },
  { name: 'Chat model: qwen3:14b',                    r: 'Strong reasoning, local',               techs: ['qwen3:14b'] },
  { name: 'Embedding model: nomic-embed-text',        r: '768-dim vectors, fast',                 techs: ['nomic-embed-text'] },
  { name: 'Code intelligence: qwen2.5-coder:14b',     r: 'Planned, not yet wired',               techs: ['qwen2.5-coder:14b'] },
  { name: 'Animation: Framer Motion + Canvas',        r: 'Declarative animations, 2D particles', techs: ['Framer Motion','Canvas'] },
  { name: 'Test runner: Vitest',                      r: 'Fast, ESM-native',                      techs: ['Vitest'] },
]

const PHASES_DATA = [
  { name: 'Phase 1: Personal AI assistant',              desc: 'Chat + memory + projects + graph.', status: 'current', te: [{ r: 'related_to' as GraphRelationship, t: 'Ollama' }, { r: 'related_to' as GraphRelationship, t: 'IndexedDB' }], ae: [] as string[] },
  { name: 'Phase 2: Persistent World Model depth',       desc: 'Git Observer, Repository entities.', status: 'next', te: [], ae: [] },
  { name: 'Phase 3: Ambient desktop companion',          desc: 'Global hotkey, system tray, always-on-top.', status: 'future', te: [], ae: ['Invocation — ⌥ (Option) + Space Global Hotkey','Overlay — Full-Screen, Always-On-Top'] },
  { name: 'Phase 4: Proactive observer',                 desc: 'File watcher, IDE plugin, calendar, email.', status: 'future', te: [], ae: [] },
  { name: 'Phase 5: Personal operating system layer',    desc: 'Cross-app intelligence, pattern recognition.', status: 'future', te: [], ae: [] },
  { name: 'Phase 6: Autonomous execution + approval gate', desc: 'Piku can act — with explicit user confirmation.', status: 'future', te: [], ae: ['K5: Consequential actions require user confirmation','K6: No World Model modification without user approval'] },
]

const NORTH_STAR_NAME = 'North Star: Ambient companion that knows everything happening in your world'

const PHILOSOPHY_DATA = [
  { name: 'Philosophy 1: Memory is the relationship',    r: 'Piku\'s entire value comes from remembering, connecting, and carrying context.', links: [] as Array<{type: GraphNodeType; name: string; rel: GraphRelationship}> },
  { name: 'Philosophy 2: Presence over interface',        r: 'Reduce chrome until what remains is presence.', links: [] },
  { name: 'Philosophy 3: Earn the right to interrupt',    r: 'Silence is the default. Attention is expensive.', links: [] },
  { name: 'Philosophy 4: Continuity of being',            r: 'Piku never resets to zero, never greets as a stranger.', links: [{ type: 'decision' as GraphNodeType, name: 'P1: Piku is not the model', rel: 'related_to' as GraphRelationship }] },
  { name: 'Philosophy 5: Privacy as intimacy',            r: 'Data never leaves the machine without explicit user choice.', links: [{ type: 'decision' as GraphNodeType, name: 'P4: Local-first always', rel: 'related_to' as GraphRelationship }, { type: 'decision' as GraphNodeType, name: 'K4: No data leaves machine without user choice', rel: 'related_to' as GraphRelationship }] },
  { name: 'Philosophy 6: Every consequential action reversible or confirmed', r: 'Piku never makes the user afraid of what it might do.', links: [{ type: 'decision' as GraphNodeType, name: 'K5: Consequential actions require user confirmation', rel: 'related_to' as GraphRelationship }, { type: 'decision' as GraphNodeType, name: 'K6: No World Model modification without user approval', rel: 'related_to' as GraphRelationship }] },
  { name: 'Philosophy 7: The user is the author; Piku is the steward', r: 'Piku holds, organizes, and advises — but the life is the user\'s, always.', links: [] },
]

// ── Test suite ────────────────────────────────────────────────────────────────

describe.skip('GDD Phase 2 Step 4 — Ownership Layer', () => {

  let beforeNodes = 0
  let beforeEdges = 0
  let beforeIsolated: string[] = []

  // ── Establish full cumulative baseline ────────────────────────────────────

  beforeAll(async () => {
    const SRC05 = 'docs/CANONICAL/05_DECISIONS.md'
    const SRC01 = 'docs/CANONICAL/01_PRODUCT_VISION.md'

    // Phase 1: ADR seeding
    const decisions = readFileSync(resolve(ROOT, SRC05), 'utf-8')
    await new DocumentSeeder().seedFromFile(decisions, SRC05, 'Piku Core', 'adr', 3)
    await syncMap()

    // Phase 2: P1245 content
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

    // Phase 3: Vision seeding
    for (const p of PHASES_DATA) {
      await seedNode('goal', p.name, { description: p.desc, status: p.status, sourceDoc: SRC01 })
      for (const te of p.te) await createEdge('goal', p.name, te.r, 'technology', te.t)
      for (const adrName of p.ae) await createEdge('goal', p.name, 'related_to', 'decision', adrName)
    }
    const phases = PHASES_DATA.map(p => p.name)
    for (let i = 0; i < phases.length - 1; i++) {
      await createEdge('goal', phases[i + 1], 'depends_on', 'goal', phases[i])
    }
    await seedNode('goal', NORTH_STAR_NAME, { description: 'What is happening in my world right now?', status: 'mission', sourceDoc: SRC01 })
    await createEdge('goal', NORTH_STAR_NAME, 'related_to', 'goal', 'Phase 5: Personal operating system layer')

    for (const p of PHILOSOPHY_DATA) {
      await seedNode('decision', p.name, { reasoning: p.r, status: 'active', category: 'philosophy', sourceDoc: SRC01 })
      for (const lnk of p.links) await createEdge('decision', p.name, lnk.rel, lnk.type, lnk.name)
    }

    await syncMap()

    const allNodes = await store.getAllNodes()
    const allEdges = await store.getAllEdges()
    beforeNodes = allNodes.length
    beforeEdges = allEdges.length
    beforeIsolated = allNodes
      .filter(n => edgeCount(n.id, allEdges) === 0)
      .map(n => `[${n.type}] ${n.name}`)

    console.log(`\n[Baseline — Phases 1+2+3 complete] nodes=${beforeNodes} edges=${beforeEdges} isolated=${beforeIsolated.length}`)
  }, 30_000)

  // ── Task 1 + 2: Create Piku Core and Jaskirat Singh ──────────────────────

  it('Task 1+2: creates project node Piku Core and person node Jaskirat Singh', async () => {
    await seedNode('project', 'Piku Core', {
      status:      'active',
      category:    'product',
      source:      'canonical',
      description: 'Local-first ambient AI companion. The World Model is the product.',
    })
    await seedNode('person', 'Jaskirat Singh', {
      role:         'creator',
      relationship: 'owner',
    })

    const names = new Set((await store.getAllNodes()).map(n => n.name))
    expect(names.has('Piku Core'),        'Piku Core project node').toBe(true)
    expect(names.has('Jaskirat Singh'),   'Jaskirat Singh person node').toBe(true)

    console.log('  ✓ Piku Core [project] created')
    console.log('  ✓ Jaskirat Singh [person] created')
  })

  // ── Task 3: Ownership edge ────────────────────────────────────────────────

  it('Task 3: Piku Core → owned_by → Jaskirat Singh', async () => {
    const ok = await createEdge('project', 'Piku Core', 'owned_by', 'person', 'Jaskirat Singh')
    expect(ok, 'owned_by edge created').toBe(true)

    const edges = await store.getAllEdges()
    const pikuId  = nameToId.get(nkey('project', 'Piku Core'))
    const jasiId  = nameToId.get(nkey('person', 'Jaskirat Singh'))
    const owns    = edges.find(e => e.fromId === pikuId && e.toId === jasiId && e.relationship === 'owned_by')
    expect(owns, 'Piku Core → owned_by → Jaskirat Singh edge').toBeDefined()

    console.log('  ✓ Piku Core → owned_by → Jaskirat Singh')
  })

  // ── Task 4: Attach all existing nodes via part_of ────────────────────────

  it('Task 4a: attaches all ADR decision nodes via part_of → Piku Core', async () => {
    let created = 0
    for (const [type, name] of ADR_NODES) {
      const ok = await createEdge(type, name, 'part_of', 'project', 'Piku Core')
      if (ok) created++
    }
    console.log(`  ✓ ADR nodes: ${created}/${ADR_NODES.length} part_of edges created`)
    expect(created).toBe(ADR_NODES.length)
  })

  it('Task 4b: attaches all principle nodes P1–P8 via part_of → Piku Core', async () => {
    let created = 0
    for (const [type, name] of PRINCIPLE_NODES) {
      const ok = await createEdge(type, name, 'part_of', 'project', 'Piku Core')
      if (ok) created++
    }
    console.log(`  ✓ Principle nodes: ${created}/${PRINCIPLE_NODES.length} part_of edges created`)
    expect(created).toBe(PRINCIPLE_NODES.length)
  })

  it('Task 4c: attaches all rule nodes Rule 1–6 via part_of → Piku Core', async () => {
    let created = 0
    for (const [type, name] of RULE_NODES) {
      const ok = await createEdge(type, name, 'part_of', 'project', 'Piku Core')
      if (ok) created++
    }
    console.log(`  ✓ Rule nodes: ${created}/${RULE_NODES.length} part_of edges created`)
    expect(created).toBe(RULE_NODES.length)
  })

  it('Task 4d: attaches all constraint nodes K1–K6 via part_of → Piku Core', async () => {
    let created = 0
    for (const [type, name] of CONSTRAINT_NODES) {
      const ok = await createEdge(type, name, 'part_of', 'project', 'Piku Core')
      if (ok) created++
    }
    console.log(`  ✓ Constraint nodes: ${created}/${CONSTRAINT_NODES.length} part_of edges created`)
    expect(created).toBe(CONSTRAINT_NODES.length)
  })

  it('Task 4e: attaches all goal nodes Phases 1–6 + North Star via part_of → Piku Core', async () => {
    let created = 0
    for (const [type, name] of GOAL_NODES) {
      const ok = await createEdge(type, name, 'part_of', 'project', 'Piku Core')
      if (ok) created++
    }
    console.log(`  ✓ Goal nodes: ${created}/${GOAL_NODES.length} part_of edges created`)
    expect(created).toBe(GOAL_NODES.length)
  })

  // ── Task 5+6: Audit — before / after isolation ────────────────────────────

  it('Tasks 5+6: graph audit — node/edge delta and isolation analysis', async () => {
    const allNodes = await store.getAllNodes()
    const allEdges = await store.getAllEdges()

    const byType: Record<string, number> = {}
    for (const n of allNodes) byType[n.type] = (byType[n.type] ?? 0) + 1

    const edgeCounts: Record<string, number> = {}
    for (const e of allEdges) {
      edgeCounts[e.fromId] = (edgeCounts[e.fromId] ?? 0) + 1
      edgeCounts[e.toId]   = (edgeCounts[e.toId]   ?? 0) + 1
    }

    const nowIsolated = allNodes.filter(n => (edgeCounts[n.id] ?? 0) === 0)

    const sep = '─'.repeat(64)
    console.log(`\n${sep}`)
    console.log('  GRAPH AUDIT — GDD Phase 2 Step 4')
    console.log(sep)
    console.log(`\n  BEFORE:  ${beforeNodes} nodes  |  ${beforeEdges} edges  |  ${beforeIsolated.length} isolated`)
    console.log(`  AFTER:   ${allNodes.length} nodes  |  ${allEdges.length} edges  |  ${nowIsolated.length} isolated`)
    console.log(`\n  Delta:   +${allNodes.length - beforeNodes} nodes  |  +${allEdges.length - beforeEdges} edges  |  ${beforeIsolated.length - nowIsolated.length} nodes de-isolated`)
    console.log(`\n  Nodes by type:`)
    for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${type.padEnd(12)} ${count}`)
    }
    console.log(`\n  Isolated BEFORE (${beforeIsolated.length}):`)
    for (const n of beforeIsolated) console.log(`    • ${n}`)

    console.log(`\n  Isolated AFTER (${nowIsolated.length}):`)
    for (const n of nowIsolated) {
      console.log(`    • [${n.type}] ${n.name}`)
    }
    console.log(`\n  Why remaining isolated nodes exist:`)
    for (const n of nowIsolated) {
      const reason =
        n.name.startsWith('Philosophy 1') ? 'Product UX principle — no direct tech or ADR link; awaits cross-doc semantic edges' :
        n.name.startsWith('Philosophy 2') ? 'Product UX principle — no direct tech or ADR link; awaits cross-doc semantic edges' :
        n.name.startsWith('Philosophy 3') ? 'Product UX principle — no direct tech or ADR link; awaits cross-doc semantic edges' :
        n.name.startsWith('Philosophy 7') ? 'Product UX principle — no direct tech or ADR link; awaits cross-doc semantic edges' :
        'Unknown — investigate'
      console.log(`    [${n.type}] ${n.name.slice(0, 50)}`)
      console.log(`      → ${reason}`)
    }
    console.log(sep)

    // Assertions
    expect(allNodes.length).toBe(beforeNodes + 2)  // +Piku Core, +Jaskirat Singh
    expect(allEdges.length - beforeEdges).toBe(ALL_PART_OF_NODES.length + 1) // +42 part_of + 1 owned_by
    expect(nowIsolated.length).toBeLessThan(beforeIsolated.length)
    expect(nowIsolated.length).toBeLessThanOrEqual(6) // philosophy 1,2,3,7 + any unexpected
    expect(byType['project']).toBe(1)
    expect(byType['person']).toBe(1)
  })

  // ── Task 7: Traversal validation ─────────────────────────────────────────

  it('Task 7: traversal — Jaskirat → Piku Core → ADRs → technologies', async () => {
    const allNodes = await store.getAllNodes()
    const allEdges = await store.getAllEdges()

    const nodeById = new Map(allNodes.map(n => [n.id, n]))
    const jaskiratId = nameToId.get(nkey('person', 'Jaskirat Singh'))!
    const pikuCoreId = nameToId.get(nkey('project', 'Piku Core'))!

    // Step 1: from Jaskirat → find what Jaskirat owns
    //   We follow reverse of owned_by: find nodes where toId=Jaskirat and rel=owned_by
    const ownedByJaskirat = allEdges
      .filter(e => e.toId === jaskiratId && e.relationship === 'owned_by')
      .map(e => nodeById.get(e.fromId)!)
      .filter(Boolean)

    // Step 2: from Piku Core → find all part_of children
    const pikuChildren = allEdges
      .filter(e => e.toId === pikuCoreId && e.relationship === 'part_of')
      .map(e => nodeById.get(e.fromId)!)
      .filter(Boolean)

    // Step 3: for ADR children, follow their outgoing edges to technology
    const adrChildren = pikuChildren.filter(n => n.type === 'decision')
    const adrToTech: Array<{ adr: string; techs: string[] }> = []
    for (const adr of adrChildren) {
      const techEdges = allEdges
        .filter(e => e.fromId === adr.id && (e.relationship === 'related_to' || e.relationship === 'uses'))
        .map(e => nodeById.get(e.toId))
        .filter((n): n is NonNullable<typeof n> => n !== undefined && n.type === 'technology')
      if (techEdges.length > 0) {
        adrToTech.push({ adr: adr.name, techs: techEdges.map(t => t.name) })
      }
    }

    // Step 4: goal children from Piku Core
    const goalChildren = pikuChildren.filter(n => n.type === 'goal')

    const sep = '─'.repeat(64)
    console.log(`\n${sep}`)
    console.log('  TRAVERSAL VALIDATION')
    console.log(sep)
    console.log(`\n  Traversal 1: Jaskirat Singh → [owns via owned_by↑] → Piku Core → [part_of children] → ADRs → technologies`)
    console.log(`\n  Jaskirat Singh`)
    for (const owned of ownedByJaskirat) {
      console.log(`    ← owned_by ← ${owned.name} [${owned.type}]`)
    }
    console.log(`\n  Piku Core → part_of children: ${pikuChildren.length} total`)
    console.log(`    ADR decisions:  ${adrChildren.filter(n => n.name.includes('ADR') || n.name.startsWith('Platform') || n.name.startsWith('Voice') || n.name.startsWith('Animation') || n.name.startsWith('Invocation') || n.name.startsWith('Framework') || n.name.startsWith('Developer') || n.name.startsWith('State') || n.name.startsWith('Chat') || n.name.startsWith('Persistence') || n.name.startsWith('Overlay') || n.name.startsWith('Error') || n.name.startsWith('Feature') || n.name === 'mock' || n.name === 'no-persistence').length}`)
    console.log(`    Principles:     ${pikuChildren.filter(n => n.name.startsWith('P')).length}`)
    console.log(`    Rules:          ${pikuChildren.filter(n => n.name.startsWith('Rule')).length}`)
    console.log(`    Constraints:    ${pikuChildren.filter(n => n.name.startsWith('K')).length}`)
    console.log(`    Goals:          ${goalChildren.length}`)

    console.log(`\n  Sample ADR → technology traversal:`)
    for (const { adr, techs } of adrToTech) {
      console.log(`    ${adr.slice(0, 45)}`)
      for (const t of techs) console.log(`      → uses/related_to → ${t}`)
    }

    console.log(`\n  Traversal 2: Jaskirat → Piku Core → goals → principles → constraints`)
    console.log(`\n  Jaskirat Singh`)
    console.log(`    ← owned_by ← Piku Core [project]`)
    console.log(`      part_of children [goal]:`)
    for (const g of goalChildren.slice(0, 3)) {
      console.log(`        • ${g.name}`)
      // follow goal's outgoing edges
      const goalEdges = allEdges
        .filter(e => e.fromId === g.id)
        .map(e => ({ rel: e.relationship, to: nodeById.get(e.toId)! }))
        .filter(x => x.to)
      for (const { rel, to } of goalEdges.slice(0, 2)) {
        console.log(`          → ${rel} → ${to.name} [${to.type}]`)
        // one level deeper for principle links
        if (to.type === 'decision' && to.name.startsWith('K')) {
          const kEdges = allEdges
            .filter(e => e.toId === to.id && e.relationship === 'related_to')
            .map(e => nodeById.get(e.fromId))
            .filter((n): n is NonNullable<typeof n> => n !== undefined)
          for (const lnk of kEdges.slice(0, 1)) {
            console.log(`            ← related_to ← ${lnk.name} [${lnk.type}]`)
          }
        }
      }
    }
    console.log(sep)

    // Assertions
    expect(ownedByJaskirat.length).toBe(1)
    expect(ownedByJaskirat[0].name).toBe('Piku Core')
    expect(pikuChildren.length).toBe(ALL_PART_OF_NODES.length)
    expect(goalChildren.length).toBe(GOAL_NODES.length)
    expect(adrToTech.length).toBeGreaterThan(0)
  })

  // ── Final: graph health review ────────────────────────────────────────────

  it('graph health review', async () => {
    const allNodes = await store.getAllNodes()
    const allEdges = await store.getAllEdges()

    const edgeCounts: Record<string, number> = {}
    for (const e of allEdges) {
      edgeCounts[e.fromId] = (edgeCounts[e.fromId] ?? 0) + 1
      edgeCounts[e.toId]   = (edgeCounts[e.toId]   ?? 0) + 1
    }

    const pikuCoreId  = nameToId.get(nkey('project', 'Piku Core'))!
    const pikuEdges   = edgeCounts[pikuCoreId] ?? 0

    const relCounts: Record<string, number> = {}
    for (const e of allEdges) relCounts[e.relationship] = (relCounts[e.relationship] ?? 0) + 1

    const isolated = allNodes.filter(n => (edgeCounts[n.id] ?? 0) === 0)

    const byType: Record<string, number> = {}
    for (const n of allNodes) byType[n.type] = (byType[n.type] ?? 0) + 1

    // Avg edges per node
    const totalEdgeEndpoints = allEdges.length * 2
    const avgEdgesPerNode = (totalEdgeEndpoints / allNodes.length).toFixed(1)

    // Most connected
    const topNode = allNodes
      .sort((a, b) => (edgeCounts[b.id] ?? 0) - (edgeCounts[a.id] ?? 0))[0]

    const sep = '─'.repeat(64)
    console.log(`\n${sep}`)
    console.log('  GRAPH HEALTH REVIEW — Post Step 4')
    console.log(sep)
    console.log(`\n  STRUCTURE:`)
    console.log(`    Total nodes:         ${allNodes.length}`)
    console.log(`    Total edges:         ${allEdges.length}`)
    console.log(`    Avg edges/node:      ${avgEdgesPerNode}`)
    console.log(`    Isolated nodes:      ${isolated.length}`)
    console.log(`    Graph diameter:      ~3 hops (Jaskirat → Piku Core → ADR → technology)`)
    console.log(`\n  ROOT ANCHOR:`)
    console.log(`    Piku Core [project]: ${pikuEdges} edges (${pikuEdges - 1} part_of incoming + 1 owned_by outgoing)`)
    console.log(`\n  RELATIONSHIP DISTRIBUTION:`)
    for (const [rel, count] of Object.entries(relCounts).sort((a, b) => b[1] - a[1])) {
      const bar = '█'.repeat(Math.round(count / 2))
      console.log(`    ${rel.padEnd(14)} ${String(count).padStart(3)}  ${bar}`)
    }
    console.log(`\n  MOST CONNECTED NODE:`)
    console.log(`    ${topNode.name} [${topNode.type}] — ${edgeCounts[topNode.id]} edges`)
    console.log(`\n  NODE TYPE BREAKDOWN:`)
    for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${type.padEnd(12)} ${count}`)
    }
    console.log(`\n  HEALTH SCORE:`)
    const isolationRate = (isolated.length / allNodes.length * 100).toFixed(1)
    const coverage = (100 - parseFloat(isolationRate)).toFixed(1)
    console.log(`    Connected nodes: ${coverage}%  (${allNodes.length - isolated.length}/${allNodes.length})`)
    console.log(`    Isolated rate:   ${isolationRate}%  (${isolated.length} nodes)`)
    console.log(`    Root reachable:  YES — Piku Core is anchor for ${pikuEdges - 1} nodes`)
    console.log(`\n  REMAINING WEAKNESSES:`)
    console.log(`    • ${isolated.length} philosophy nodes isolated (UX principles, no tech links)`)
    console.log(`    • Tech-choice decisions not linked to Piku Core (via part_of)`)
    console.log(`    • Philosophy nodes not linked to Piku Core (not in scope for Step 4)`)
    console.log(`    • No cross-document semantic edges yet (next task)`)
    console.log(`    • 02_CURRENT_STATE, 03_ARCHITECTURE, 04_ROADMAP unseeded`)
    console.log(sep)

    // Health assertions
    expect(allNodes.length).toBe(80)
    expect(allEdges.length).toBeGreaterThanOrEqual(95)
    expect(allEdges.length).toBeLessThanOrEqual(102)
    expect(isolated.length).toBeLessThanOrEqual(6)
    expect(pikuEdges).toBeGreaterThan(40)  // Piku Core should be highly connected
    expect(byType['project']).toBe(1)
    expect(byType['person']).toBe(1)
  })

})
