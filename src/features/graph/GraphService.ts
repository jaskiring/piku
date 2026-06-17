import { logger }                  from '../../lib/logger'
import type {
  GraphNode, GraphEdge, GraphNodeType, GraphRelationship,
  ProjectRisk, NextBestAction, Galaxy,
} from './types'
import { GraphStore }              from './GraphStore'
import { GraphExtractionService, CONFIRM_THRESHOLD } from './GraphExtractionService'
import { graphActivityLog }        from './GraphActivityLog'
import { EmbeddingService }        from '../memory/EmbeddingService'

// Human-readable type labels used as embedding context.
// Embedding "technical decision: Use PKCE" is semantically richer than "Use PKCE" alone.
const TYPE_LABEL: Record<GraphNodeType, string> = {
  project:    'software project',
  goal:       'goal or objective',
  skill:      'human capability or professional ability',
  person:     'person',
  memory:     'memory or past event',
  decision:   'technical or design decision',
  repository: 'code repository or codebase',
  technology: 'technology, tool, framework, or protocol',
  concept:    'architectural or domain concept',
}

export class GraphService {
  private store      = new GraphStore()
  private extractor  = new GraphExtractionService()
  private embeddings = new EmbeddingService()

  // ── Node CRUD ──────────────────────────────────────────────────────────────

  async createNode(
    type: GraphNodeType,
    name: string,
    metadata: Record<string, unknown> = {},
  ): Promise<GraphNode> {
    // Reuse existing node of the same type + name to avoid duplicates
    const existing = await this.store.findNodeByName(name, type)
    if (existing) {
      logger.project('graph: node already exists', { type, name, id: existing.id })
      // Backfill embedding for older nodes that were saved before semantic support
      if (!existing.embedding) void this.embedAndSave(existing)
      graphActivityLog.emit({ type: 'node_created', node: existing, isNew: false })
      return existing
    }

    const now  = Date.now()
    const node: GraphNode = { id: crypto.randomUUID(), type, name, metadata, createdAt: now, updatedAt: now }
    await this.store.saveNode(node)
    logger.project('graph: node created', { type, name, id: node.id })

    // Non-blocking: embedding written to IDB after createNode() returns.
    // GraphSource reads fresh from IDB on each query, so it will see the
    // embedding on the next retrieval call.
    void this.embedAndSave(node)

    graphActivityLog.emit({ type: 'node_created', node, isNew: true })
    return node
  }

  // Generates an embedding for a node and persists the updated record.
  // Called fire-and-forget — never blocks node creation or extraction.
  private async embedAndSave(node: GraphNode): Promise<void> {
    try {
      const text      = `${TYPE_LABEL[node.type]}: ${node.name}`
      const embedding = await this.embeddings.embed(text)
      await this.store.saveNode({ ...node, embedding })
      logger.project('graph: embedding saved', { type: node.type, name: node.name })
    } catch (err) {
      // Non-fatal: keyword matching still works without embeddings
      logger.warn('graph: embedding generation failed', { name: node.name, error: String(err) })
    }
  }

  // Backfills embeddings for all nodes that were created before semantic
  // support was added. Called once at startup from graph/index.ts.
  async backfillEmbeddings(): Promise<void> {
    const nodes   = await this.store.getAllNodes()
    const missing = nodes.filter(n => !n.embedding)

    if (missing.length === 0) return

    logger.project('graph: backfilling embeddings', { count: missing.length })

    // Sequential to avoid hammering Ollama — each embed call is ~100ms
    for (const node of missing) {
      await this.embedAndSave(node)
    }

    logger.project('graph: backfill complete', { count: missing.length })
  }

  async getNode(id: string): Promise<GraphNode | undefined> {
    return this.store.getNode(id)
  }

  async getAllNodes(): Promise<GraphNode[]> {
    return this.store.getAllNodes()
  }

  // ── Edge CRUD ──────────────────────────────────────────────────────────────

  async createEdge(
    fromId: string,
    toId: string,
    relationship: GraphRelationship,
    strength = 0.8,
    status: GraphEdge['status'] = 'confirmed',
  ): Promise<GraphEdge> {
    // Update existing edge rather than create a duplicate
    const existing = await this.store.findDuplicateEdge(fromId, toId, relationship)
    if (existing) {
      const updated: GraphEdge = {
        ...existing,
        strength: Math.max(existing.strength, strength),
        status:   existing.status === 'confirmed' ? 'confirmed' : status,
      }
      await this.store.saveEdge(updated)
      logger.project('graph: edge updated', { fromId, toId, relationship, strength: updated.strength })
      return updated
    }
    const edge: GraphEdge = {
      id: crypto.randomUUID(),
      fromId,
      toId,
      relationship,
      strength,
      status,
      createdAt: Date.now(),
    }
    await this.store.saveEdge(edge)
    logger.project('graph: edge created', { fromId, toId, relationship, strength, status })
    return edge
  }

  // ── Graph traversal ────────────────────────────────────────────────────────

  async getNeighbors(nodeId: string): Promise<Array<{ node: GraphNode; edge: GraphEdge }>> {
    const edges = await this.store.getEdgesForNode(nodeId)
    const confirmed = edges.filter(e => e.status === 'confirmed')
    const pairs = await Promise.all(
      confirmed.map(async edge => {
        const otherId = edge.fromId === nodeId ? edge.toId : edge.fromId
        const node    = await this.store.getNode(otherId)
        return node ? { node, edge } : null
      })
    )
    return pairs.filter((p): p is { node: GraphNode; edge: GraphEdge } => p !== null)
  }

  // Nodes that nodeId depends_on
  async findDependencies(nodeId: string): Promise<GraphNode[]> {
    const out = await this.store.getEdgesFromNode(nodeId)
    const depEdges = out.filter(e => e.relationship === 'depends_on' && e.status === 'confirmed')
    return this.resolveNodes(depEdges.map(e => e.toId))
  }

  // Nodes that are blocking nodeId
  async findBlockers(nodeId: string): Promise<GraphNode[]> {
    const inbound = await this.store.getEdgesToNode(nodeId)
    const blockEdges = inbound.filter(e => e.relationship === 'blocks' && e.status === 'confirmed')
    return this.resolveNodes(blockEdges.map(e => e.fromId))
  }

  // Nodes that support nodeId (skills, goals, etc. enabling it)
  async findSupportingNodes(nodeId: string): Promise<GraphNode[]> {
    const inbound = await this.store.getEdgesToNode(nodeId)
    const suppEdges = inbound.filter(e => e.relationship === 'supports' && e.status === 'confirmed')
    return this.resolveNodes(suppEdges.map(e => e.fromId))
  }

  // ── Reasoning helpers ──────────────────────────────────────────────────────

  async analyzeProjectRisk(projectIdOrName: string): Promise<ProjectRisk> {
    const allNodes = await this.store.getAllNodes()

    const node = allNodes.find(n =>
      n.type === 'project' && (
        n.id === projectIdOrName ||
        (n.metadata.projectId as string | undefined) === projectIdOrName ||
        n.name.toLowerCase() === projectIdOrName.toLowerCase()
      )
    )

    if (!node) {
      logger.project('analyzeProjectRisk: node not found', { query: projectIdOrName })
      return {
        nodeId:          projectIdOrName,
        nodeName:        projectIdOrName,
        dependencies:    [],
        blockers:        [],
        weakSkills:      [],
        recommendations: ['No graph data available for this project yet.'],
      }
    }

    const [dependencies, blockers, supporters] = await Promise.all([
      this.findDependencies(node.id),
      this.findBlockers(node.id),
      this.findSupportingNodes(node.id),
    ])

    // Edges for supporters to check strength
    const inbound  = await this.store.getEdgesToNode(node.id)
    const suppEdges = inbound.filter(e => e.relationship === 'supports' && e.status === 'confirmed')

    const weakSkills = supporters
      .filter(s => s.type === 'skill')
      .filter(s => {
        const edge = suppEdges.find(e => e.fromId === s.id)
        return edge ? edge.strength < 0.6 : false
      })
      .map(s => s.name)

    const recommendations: string[] = []
    if (blockers.length > 0)
      recommendations.push(`Resolve ${blockers.length} blocker(s) before advancing: ${blockers.map(b => b.name).join(', ')}`)
    if (dependencies.length > 0)
      recommendations.push(`Ensure dependencies are ready: ${dependencies.map(d => d.name).join(', ')}`)
    if (weakSkills.length > 0)
      recommendations.push(`Strengthen weak skills: ${weakSkills.join(', ')}`)
    if (recommendations.length === 0)
      recommendations.push('No significant risks detected. Clear to proceed.')

    return {
      nodeId:       node.id,
      nodeName:     node.name,
      dependencies: dependencies.map(d => d.name),
      blockers:     blockers.map(b => b.name),
      weakSkills,
      recommendations,
    }
  }

  async suggestNextBestAction(): Promise<NextBestAction | null> {
    const allNodes = await this.store.getAllNodes()
    const allEdges = await this.store.getConfirmedEdges()
    const projects = allNodes.filter(n => n.type === 'project')

    if (projects.length === 0) return null

    // Score projects by actionability: penalize blockers, reward support
    const scored = projects.map(p => {
      const blockCount   = allEdges.filter(e => e.toId === p.id && e.relationship === 'blocks').length
      const suppEdges    = allEdges.filter(e => e.toId === p.id && e.relationship === 'supports')
      const suppStrength = suppEdges.length > 0
        ? suppEdges.reduce((s, e) => s + e.strength, 0) / suppEdges.length
        : 0
      const depCount  = allEdges.filter(e => e.fromId === p.id && e.relationship === 'depends_on').length

      // Higher = more actionable: no blockers + strong support + fewer open deps
      const score = (1 / (1 + blockCount)) * 0.55 + suppStrength * 0.30 + (1 / (1 + depCount)) * 0.15

      return { project: p, score, blockCount, suppEdges, depCount }
    })

    const best = scored.sort((a, b) => b.score - a.score)[0]
    if (!best) return null

    const supporting = await this.resolveNodes(best.suppEdges.map(e => e.fromId))
    const relatedNodes = supporting.map(n => n.name).slice(0, 3)

    const reasoning = best.blockCount === 0
      ? `${best.project.name} has no blockers and ${best.suppEdges.length > 0 ? 'good skill support' : 'a clear path forward'}`
      : `${best.project.name} has the best current actionability despite ${best.blockCount} blocker(s)`

    return {
      projectName:  best.project.name,
      action:       `Advance ${best.project.name}`,
      reasoning,
      relatedNodes,
    }
  }

  // ── Public data accessors (used by UI) ────────────────────────────────────

  async getConfirmedEdges(): Promise<GraphEdge[]> {
    return this.store.getConfirmedEdges()
  }

  // ── Prompt context ─────────────────────────────────────────────────────────

  async retrieveGraphContext(_query: string): Promise<string> {
    const edges = await this.store.getConfirmedEdges()
    if (edges.length === 0) return ''

    const allNodes = await this.store.getAllNodes()
    const nodeMap  = new Map(allNodes.map(n => [n.id, n]))

    // Group edges by relationship type for a structured prompt block
    const byRel: Record<string, string[]> = {}
    for (const edge of edges) {
      const from = nodeMap.get(edge.fromId)
      const to   = nodeMap.get(edge.toId)
      if (!from || !to) continue
      const line = `• [${from.type}] ${from.name} → [${to.type}] ${to.name}` +
        (edge.strength < 1 ? ` (${Math.round(edge.strength * 100)}%)` : '')
      ;(byRel[edge.relationship] ??= []).push(line)
    }

    const sections: string[] = ['Knowledge Graph:']
    const relLabels: Record<string, string> = {
      depends_on: 'Dependencies',
      blocks:     'Blockers',
      supports:   'Skills & Support',
      caused_by:  'Causal Links',
      related_to: 'Related Concepts',
      owned_by:   'Ownership',
      uses:       'Uses',
      supersedes: 'Supersedes',
      implements: 'Implements',
      part_of:    'Part Of',
    }
    for (const [rel, lines] of Object.entries(byRel)) {
      if (lines.length > 0) sections.push(`${relLabels[rel] ?? rel}:\n${lines.join('\n')}`)
    }

    // Append next best action
    try {
      const action = await this.suggestNextBestAction()
      if (action) {
        sections.push(
          `Suggested Focus: ${action.action}\n` +
          `Reason: ${action.reasoning}` +
          (action.relatedNodes.length > 0 ? `\nSupported by: ${action.relatedNodes.join(', ')}` : '')
        )
      }
    } catch { /* non-critical */ }

    return sections.join('\n\n')
  }

  // ── Galaxy clustering ──────────────────────────────────────────────────────
  // Groups nodes into galaxies: core (Piku, user), per-project subgraphs, and
  // a brainstorm galaxy for unassigned extraction output.

  async getGalaxies(): Promise<Galaxy[]> {
    const allNodes = await this.store.getAllNodes()
    const allEdges = await this.store.getAllEdges()
    const confirmed = allEdges.filter(e => e.status === 'confirmed')
    const galaxies: Galaxy[] = []

    // 1) Core galaxy — Piku + user person node + core concepts
    const coreNames = new Set(['piku', 'jaskirat', 'jas'])
    const coreNodes = allNodes.filter(n => coreNames.has(n.name.toLowerCase()))
    const coreIds   = new Set(coreNodes.map(n => n.id))
    const coreEdges = confirmed.filter(e => coreIds.has(e.fromId) || coreIds.has(e.toId))
    if (coreNodes.length > 0) {
      galaxies.push({ id: 'galaxy-core', kind: 'core', name: 'Core', nodes: coreNodes, edges: coreEdges })
    }

    // 2) Project galaxies — group by metadata.projectId or part_of edges
    const assignedIds = new Set<string>(coreIds)
    const projectIds  = new Set<string>()
    for (const n of allNodes) {
      const pid = n.metadata?.projectId as string | undefined
      if (pid) projectIds.add(pid)
    }

    for (const pid of projectIds) {
      const projectNode = allNodes.find(n => n.id === pid || n.metadata?.projectId === pid)
      const pName = projectNode?.name ?? pid.slice(0, 8)
      const pNodes = allNodes.filter(n => {
        if (n.id === pid) return true
        if ((n.metadata?.projectId as string) === pid) return true
        // Also include nodes linked via part_of to this project
        const partOfEdge = confirmed.find(e =>
          (e.fromId === n.id || e.toId === n.id) &&
          e.relationship === 'part_of' &&
          (e.fromId === pid || e.toId === pid)
        )
        return !!partOfEdge
      })
      for (const n of pNodes) assignedIds.add(n.id)
      const pEdgeIds = new Set(confirmed.filter(e =>
        pNodes.some(n => n.id === e.fromId) && pNodes.some(n => n.id === e.toId)
      ).map(e => e.id))
      const pEdges = confirmed.filter(e => pEdgeIds.has(e.id))
      galaxies.push({ id: `galaxy-${pid}`, kind: 'project', name: pName, nodes: pNodes, edges: pEdges, projectId: pid })
    }

    // 3) Brainstorm galaxy — everything unassigned
    const leftover = allNodes.filter(n => !assignedIds.has(n.id))
    if (leftover.length > 0) {
      const leftIds = new Set(leftover.map(n => n.id))
      const leftEdges = confirmed.filter(e => leftIds.has(e.fromId) && leftIds.has(e.toId))
      galaxies.push({ id: 'galaxy-brainstorm', kind: 'brainstorm', name: 'Brainstorms', nodes: leftover, edges: leftEdges })
    }

    return galaxies
  }

  async getProjectSubgraph(projectId: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] } | null> {
    const allNodes = await this.store.getAllNodes()
    const allEdges = await this.store.getAllEdges()
    const confirmed = allEdges.filter(e => e.status === 'confirmed')

    // Find the project node
    const projectNode = allNodes.find(n =>
      n.id === projectId || (n.metadata?.projectId as string) === projectId
    )
    if (!projectNode) return null

    // Collect nodes: the project + anything linked via part_of or matching projectId
    const nodeIds = new Set<string>([projectNode.id])
    for (const n of allNodes) {
      if ((n.metadata?.projectId as string) === projectId) nodeIds.add(n.id)
      const partOf = confirmed.find(e =>
        (e.fromId === n.id || e.toId === n.id) &&
        e.relationship === 'part_of'
      )
      if (partOf) { nodeIds.add(n.id); nodeIds.add(partOf.fromId === n.id ? partOf.toId : partOf.fromId) }
    }

    const nodes = allNodes.filter(n => nodeIds.has(n.id))
    const edgeIds = new Set(confirmed.filter(e =>
      nodeIds.has(e.fromId) && nodeIds.has(e.toId)
    ).map(e => e.id))
    const edges = confirmed.filter(e => edgeIds.has(e.id))

    return { nodes, edges }
  }

  // ── Post-conversation processing ───────────────────────────────────────────

  async processConversation(userMessage: string, pikuResponse: string): Promise<void> {
    graphActivityLog.emit({ type: 'extraction_start' })
    try {
      const existingNodes = await this.store.getAllNodes()
      const items = await this.extractor.extract(userMessage, pikuResponse, existingNodes)

      if (items.length === 0) {
        graphActivityLog.emit({ type: 'extraction_empty' })
        return
      }

      for (const item of items) {
        await this.applyExtractionItem(item, existingNodes)
      }

      graphActivityLog.emit({ type: 'extraction_complete', itemCount: items.length })
    } catch (err) {
      logger.error('graph processConversation failed', { error: String(err) })
      graphActivityLog.emit({ type: 'extraction_empty' })
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async applyExtractionItem(
    item: Awaited<ReturnType<GraphExtractionService['extract']>>[number],
    existingNodes: GraphNode[],
  ): Promise<void> {
    const status: GraphEdge['status'] = item.confidence >= CONFIRM_THRESHOLD
      ? 'confirmed'
      : 'pending'

    // Resolve or create fromNode
    const fromNode = item.fromNode.index === -1
      ? await this.createNode(
          item.fromNode.type!,
          item.fromNode.name!,
          item.fromNode.metadata ?? {},
        )
      : existingNodes[item.fromNode.index]

    // Resolve or create toNode
    const toNode = item.toNode.index === -1
      ? await this.createNode(
          item.toNode.type!,
          item.toNode.name!,
          item.toNode.metadata ?? {},
        )
      : existingNodes[item.toNode.index]

    if (!fromNode || !toNode) {
      logger.warn('graph: could not resolve nodes for edge — skipping', {
        fromIndex: item.fromNode.index,
        toIndex:   item.toNode.index,
      })
      return
    }

    const edge = await this.createEdge(
      fromNode.id,
      toNode.id,
      item.relationship,
      item.confidence,  // use confidence as initial strength
      status,
    )
    graphActivityLog.emit({
      type:      'edge_created',
      edge,
      fromName:  fromNode.name,
      toName:    toNode.name,
      fromType:  fromNode.type,
      toType:    toNode.type,
    })
  }

  private async resolveNodes(ids: string[]): Promise<GraphNode[]> {
    const nodes = await Promise.all(ids.map(id => this.store.getNode(id)))
    return nodes.filter((n): n is GraphNode => n !== undefined)
  }
}
