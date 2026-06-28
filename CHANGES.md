# Piku — UI Polish & "Everything Dynamic" Changelog

Branch: `ui-polish` (from `glm-piku`).

**Principles followed**
- **No deletions.** Every change is a transform, rename, accuracy fix, or new file. No screen, component, helper, sample data, or feature was removed. opencode brain is kept exactly as the brain.
- **Everything dynamic from the UI.** Values that were hardcoded or `.env`-only become editable in Settings and persist to `localStorage`, with the old values as defaults.
- Cannot run the app on this machine — all changes are static/type-safe; final visual QA happens on the other laptop.

---

## Done

### Accuracy / label fixes (transform-only)
1. `src/features/os/Dock.tsx` — Playground dock label `Grnd` → `Play`.
2. `src/features/os/Sidebar.tsx` — footer status now accurate: `LOCAL · {model}` + `REASONING · OPENCODE` (was `BRAIN · {model}` / `LOCAL · PRIVATE · ON-DEVICE`, which implied fully on-device while the default brain is opencode cloud).
3. `src/features/os/screens/Automations.tsx` — build-status label `13 real tools` → `14 real tools` (14 are actually listed/registered; the header already counted 14).
4. `src/features/os/screens/AgentScreen.tsx` — the Agent screen now respects the Settings "Local-only" toggle: opencode is gated on `isOpencodeBrain()` (added that import). Default behaviour unchanged.

### New: dynamic, UI-editable settings
5. **NEW** `src/services/settings.ts` — central settings store `pikuSettings` (`get/set/reset/subscribe`, persisted to `localStorage` key `piku.settings.v1`) + `useSettings()` React hook. Fields: `operatorName, workEmail, personalEmail, workGitHub, personalGitHub, chatModel, opencodeModel, localOnly, jiraUrl, confluenceUrl, notionUrl`. Defaults fall back to the existing `VITE_PIKU_*` env vars.
6. `src/services/OllamaService.ts` — chat model is now read live from settings via `chatModel()` (upgraded from the `CHAT_MODEL` constant); `ACTIVE_BRAIN.model` is a live getter. **Embedding model intentionally left pinned.**
7. `src/services/OpencodeProvider.ts` — `OPENCODE_MODEL.modelID` is now a live getter from settings (JSON.stringify still serializes it correctly for the request body).
8. `src/features/chat/hooks/useChat.ts` — `isOpencodeBrain()`/`setOpencodeBrain()` now read/write the persisted `localOnly` setting, so the privacy toggle survives restarts and is honoured everywhere. Default unchanged (opencode on).
9. `src/features/os/screens/Screens.tsx` (SettingsScreen) — rebuilt into an **editable** Settings page: new **Profile** card (name, work/personal email, work/personal GitHub), **Models** card now editable (chat-model picker from installed Ollama models + opencode model field; embedding shown locked), **Work links** card (Jira/Confluence/Notion URLs), **Reset to defaults** button. Existing Privacy/Storage/Identity/connected-account cards kept.
10. `src/features/os/HomeOS.tsx` — Home greeting + operator line now use `settings.operatorName` (was hardcoded "Jaskirat"; default still "Jaskirat").

### Identity consumers wired to live settings (transform-only, fallbacks kept)
11. `src/features/os/screens/Canvas.tsx` & `Playground.tsx` — `EMAIL`/`GH` persona maps are now settings-backed getters (every existing `EMAIL[persona]` call site works unchanged; values update live).
12. `src/features/os/screens/Screens.tsx`
    - `GitIdentityCard` — work/personal detection + GitHub labels read live settings (`PERSONAL_EMAIL_KEY`/`WORK_EMAIL_KEY` kept as fallback).
    - `tagForEmail` (Calendar) — reads live work/personal email (now case-insensitive); `CAL_*` consts kept as fallback.
    - `CalendarScreen` FilterBar "work/personal mail" buttons use live emails.
    - `WorkScreen` — Jira/Confluence/Notion open the live URLs (`WORK_TOOL_URLS` kept as fallback).
13. `src/services/ToolRouter.ts` — `open_email` tool uses live work/personal email from settings.
14. `src/services/accounts/init.ts` — GitHub account seeding uses live work/personal usernames (env `SEEDS` kept as defaults).

### Reverted (to honour "don't delete anything")
- Restored `MOCK_PROJECTS` (Projects screen) and `MOCK_PEOPLE` (People screen) to their exact original code.

### Not touched / intentionally kept
- No screen, component, helper, sample data, or feature removed. Apparently-unused files (`AppsScreen`, `Dashboard`, `CommandCenter`, `MainOS`, `OverlayWindow`, `ParticleOrb`, etc.) left exactly as-is.
- Embedding model stays pinned (`nomic-embed-text`); opencode kept as the brain.

---

## Verification
- Cannot run/typecheck here (deps not installed, per "don't run on this PC"). Verified statically: no leftover `CHAT_MODEL` refs, all `pikuSettings`/`useSettings` imports present, no orphaned `ACTIVE_BRAIN`/`OPENCODE_MODEL` imports, remaining `VITE_PIKU_*` reads are only defaults/fallbacks. **Run `npm install && npm run build` on the other laptop to typecheck.**

## Feature completions (open dev finished, frontend-safe)
15. `src/features/overlay/components/AmbientPopup.tsx` — the ⌥+Space orb now **actually answers**: it streams a reply from the local Ollama model (fast, private, self-contained) with loading + error states, instead of echoing "wire up next". Quick-action chips still prefill the bar; esc/dismiss unchanged.
16. `src/features/os/screens/Screens.tsx` — **Files** screen is now a real browser: breadcrumb, click a folder to descend, "↑ up", per-folder loading/empty/error states (uses `list_dir(path)`, still sandboxed to home). File-open intentionally not wired (would need absolute paths / untested).
17. `src/features/os/screens/Screens.tsx` — **Models** screen: tap any local (non-embedding) model to make it Piku's active chat model (writes `pikuSettings.chatModel`); the active one is highlighted. Embedding model stays non-selectable.

## More completions (frontend + safe Rust)
18. `src-tauri/src/vault.rs` — **path-traversal security fix**: `slug`/`filename` validated via `safe_segment` (rejects `..` and separators) in `vault_write`/`vault_read`/`vault_delete`. (Run `cargo build` to confirm.)
19. `src/features/chat/hooks/useChat.ts` — failure message no longer always blames Ollama; mentions opencode too.
20. `Files` — "showing first 100 entries" hint when the listing is capped.
21. `Projects` — full **detail/editor**: tap a project → edit name/vision/state (autosaves via `updateProject`), view tracked context (in-progress / next / completed / blockers / decisions), delete, and a working "+ New project". `MOCK_PROJECTS` kept as the empty-state sample.
22. `People` — each person now shows their **relationships** (from confirmed graph edges). `MOCK_PEOPLE` kept as fallback.
23. `docs/CANONICAL/*` — CURRENT_STATE / ROADMAP / DECISIONS updated to match the real build (qwen3:4b, IndexedDB v8, opencode brain, editable settings) + ADR-006 (opencode brain) and ADR-007 (pikuSettings).

## Deferred (need the Rust backend or a live runtime to build safely — not shipped as untested guesses)
- **Work → Terminal**: real embedded PTY (Rust pty command + xterm).
- **Datasets → document ingestion**: chunker/extractor/seeder exist; wiring drag-drop needs Ollama runtime to verify end-to-end.
- **Files → file preview / open**: needs absolute-path resolution.
- **Active-app observer**: built but dormant — wiring needs a consent gate + a real consumer.
- **Personality-as-data (P7)** and the **Projects pending-update review queue**.

## Verification
- Cannot run/typecheck here (deps not installed). Verified statically: imports resolve, no orphaned `ACTIVE_BRAIN`/`OPENCODE_MODEL`, no leftover `CHAT_MODEL`. **Run `npm install && npm run build` on the other laptop to typecheck before relying on it.**
