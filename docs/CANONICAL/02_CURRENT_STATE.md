# Current State

Piku is in active development. Built and working:
- Local LLM inference via Ollama — default chat model `qwen3:4b`, **user-selectable in Settings → Models** (and on the Models screen)
- `nomic-embed-text` embeddings (pinned — changing it would invalidate stored vectors)
- "Deep-thinking brain" via a local `opencode serve` proxy to a free cloud model (default `deepseek-v4-flash-free`); turn it off with **Settings → Privacy → Local-only** (persisted)
- IndexedDB knowledge graph: 9 node types, 10 edge relationships, + World Model hybrid retrieval
- Active-app observer (built in Rust; currently dormant pending a consent surface)
- Immersive chat + multi-session Agent with a live reasoning panel
- Persistence layer: **IndexedDB v8**
- Connectors: GitHub, Gmail, Google Calendar; embedded WhatsApp/LinkedIn; Jira/Confluence/Notion via Piku's Chrome profile
- **Editable, persisted settings** (identity, models, privacy, work links) — `pikuSettings` / `useSettings`
- Ambient ⌥+Space quick-ask bar (answers locally), Files browser, Projects/People views over the graph

> Note: earlier drafts of these docs described a fully local-first, no-cloud design with `qwen3:14b` and IndexedDB v6. The live build uses `qwen3:4b`, IndexedDB v8, and an opt-out opencode cloud brain (on by default).
