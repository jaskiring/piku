// ── Shared visual constants — single source of truth for node type colours ──
// Used by GraphCanvas (hex for SVG fills) and GraphPanel (Tailwind classes for HTML).

export const NODE_COLORS: Record<string, string> = {
  project:    '#60A5FA',
  goal:       '#A78BFA',
  skill:      '#34D399',
  person:     '#FBBF24',
  memory:     '#F472B6',
  decision:   '#FB923C',
  repository: '#3B82F6',
  technology: '#38BDF8',
  concept:    '#22D3EE',
}
export const DEFAULT_NODE_COLOR = '#93C5FD'

export const NODE_TEXT_COLORS: Record<string, string> = {
  project:    'text-blue-400/70',
  goal:       'text-purple-400/70',
  skill:      'text-green-400/70',
  person:     'text-yellow-400/70',
  memory:     'text-pink-400/70',
  decision:   'text-orange-400/70',
  repository: 'text-blue-500/70',
  technology: 'text-sky-400/70',
  concept:    'text-cyan-400/70',
}

export const NODE_DOT_COLORS: Record<string, string> = {
  project:    'bg-blue-400/60',
  goal:       'bg-purple-400/60',
  skill:      'bg-green-400/60',
  person:     'bg-yellow-400/60',
  memory:     'bg-pink-400/60',
  decision:   'bg-orange-400/60',
  repository: 'bg-blue-500/60',
  technology: 'bg-sky-400/60',
  concept:    'bg-cyan-400/60',
}

// ── Core graph types ───────────────────────────────────────────────────────

export type GraphNodeType =
  | 'project'
  | 'goal'
  | 'skill'
  | 'person'
  | 'memory'
  | 'decision'
  | 'repository'
  | 'technology'
  | 'concept'      // named architectural, domain, or design concept (not a choice — a structural element)

export type GraphRelationship =
  | 'depends_on'
  | 'supports'
  | 'blocks'
  | 'caused_by'
  | 'related_to'
  | 'owned_by'
  | 'uses'        // project/task uses a technology
  | 'supersedes'  // decision supersedes another decision
  | 'implements'  // project/task implements a decision
  | 'part_of'     // node belongs to a project or larger entity

export type GraphEdgeStatus = 'confirmed' | 'pending'

export interface GraphNode {
  id: string
  type: GraphNodeType
  name: string
  metadata: Record<string, unknown>
  embedding?: Float32Array  // 768-dim nomic-embed-text vector; generated async after node creation
  createdAt: number
  updatedAt: number
}

export interface GraphEdge {
  id: string
  fromId: string
  toId: string
  relationship: GraphRelationship
  strength: number             // 0–1
  status: GraphEdgeStatus      // confirmed ≥ 0.85; pending 0.65–0.84
  createdAt: number
}

// ── Extraction types ───────────────────────────────────────────────────────
//
// The LLM returns a list of GraphExtractionItems.
// Each item describes a directed relationship between two nodes.
// Nodes can be existing (index ≥ 0) or new (index === -1).

export interface ExtractionNodeRef {
  index: number               // index into the existingNodes array; -1 = new
  type?: GraphNodeType        // required when index === -1
  name?: string               // required when index === -1
  metadata?: Record<string, unknown>
}

export interface GraphExtractionItem {
  confidence: number
  fromNode: ExtractionNodeRef
  relationship: GraphRelationship
  toNode: ExtractionNodeRef
}

// ── Reasoning output types ─────────────────────────────────────────────────

export interface ProjectRisk {
  nodeId: string
  nodeName: string
  dependencies: string[]
  blockers: string[]
  weakSkills: string[]           // skills with strength < 0.6
  recommendations: string[]
}

export interface NextBestAction {
  projectName: string
  action: string
  reasoning: string
  relatedNodes: string[]
}

// ── Galaxy clustering types ────────────────────────────────────────────────
// A Galaxy is a clustered subgraph — a project's knowledge graph, the core
// anchor nodes, or the brainstorm nebula of unassigned extraction output.

export type GalaxyKind = 'core' | 'project' | 'brainstorm'

export interface Galaxy {
  id: string           // kind + name-based stable id
  kind: GalaxyKind
  name: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  projectId?: string   // set when kind === 'project'
}
