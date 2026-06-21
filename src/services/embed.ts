// Drives the in-frame embedded web panels (Tauri multi-webview). Each panel has a label
// (e.g. 'wa', 'li'); the React canvas measures each panel's DOM frame and positions the matching
// native webview over it. Webviews always render above the DOM and can't be clipped, so the canvas
// hides them while dragging and snaps them back on drop.
type Rect = { x: number; y: number; width: number; height: number }

async function inv<T = void>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

const r2 = (r: Rect) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) })

export async function embedPanel(label: string, url: string, r: Rect): Promise<void> {
  await inv('embed_panel', { label, url, ...r2(r) }).catch(() => {})
}
export async function repositionEmbed(label: string, r: Rect): Promise<void> {
  await inv('reposition_embed', { label, ...r2(r) }).catch(() => {})
}
export async function hideEmbed(label: string): Promise<void> {
  await inv('hide_embed', { label }).catch(() => {})
}
export async function hideAllEmbeds(): Promise<void> {
  await inv('hide_all_embeds').catch(() => {})
}
