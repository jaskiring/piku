// Open (or focus) a dedicated persistent window for a web app with no usable API (WhatsApp, LinkedIn).
// Backed by the Rust open_web_window command; the session persists so you log in once.
export async function openWebWindow(label: string, url: string, title: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('open_web_window', { label, url, title })
}

export const WEB_APPS: Record<string, { label: string; url: string; title: string; glyph: string }> = {
  whatsapp: { label: 'whatsapp', url: 'https://web.whatsapp.com',  title: 'WhatsApp', glyph: '◍' },
  linkedin: { label: 'linkedin', url: 'https://www.linkedin.com/feed/', title: 'LinkedIn', glyph: 'in' },
}
