# Decisions

## ADR-001: Local-first architecture
Status: Accepted  
Context: Piku must work without internet access  
Decision: All inference runs locally via Ollama  
Consequences: No API costs, full privacy, limited to local model capability

## ADR-002: IndexedDB for storage
Status: Accepted  
Context: Cross-platform persistence needed for a Tauri desktop app  
Decision: Use IndexedDB with versioned schema  
Consequences: Portable, no native dependencies, good-enough performance

## ADR-003: Knowledge graph for memory
Status: Accepted  
Context: Structured relationships between entities support context-aware responses  
Decision: TypeScript-native graph with 9 node types, 10 relationship types  
Consequences: Flexible querying, extraction pipeline needed for auto-population

## ADR-004: Hub-and-spoke graph visualization
Status: Accepted  
Context: Users need to explore their knowledge graph visually  
Decision: Force-directed layout with cosmic void theme  
Consequences: Intuitive for browsing, requires clustering for large graphs

## ADR-005: nomic-embed-text for embeddings
Status: Accepted  
Context: Semantic search over memory requires embeddings  
Decision: Use nomic-embed-text via Ollama  
Consequences: 768-dim vectors, local inference, 137M parameter model

## ADR-006: opencode as the deep-thinking brain (revises ADR-001)
Status: Accepted  
Context: The local 4B is fast and private but a weak reasoner; hard asks need a stronger model.  
Decision: Route conversation/reasoning to a free, capable model via a local `opencode serve` proxy (default `deepseek-v4-flash-free`), with local Ollama as automatic fallback. Tools + embeddings stay local.  
Consequences: Better reasoning at no API cost, but conversation context leaves the machine by default. Revises ADR-001's "all inference is local" — a **Settings → Privacy → Local-only** toggle restores fully-local operation. The embedding model and all tool calls remain local.

## ADR-007: User-editable settings as the source of truth (pikuSettings)
Status: Accepted  
Context: Identity (name, work/personal email + GitHub), model choice, privacy, and work links were hardcoded or `.env`-only.  
Decision: A single persisted, reactive store (`src/services/settings.ts` — `pikuSettings` + `useSettings`) holds these; defaults fall back to `VITE_PIKU_*`. All consumers read it live.  
Consequences: Everything is changeable from Settings without rebuilds; values persist in localStorage. The embedding model is intentionally excluded (changing it would corrupt stored vectors).
