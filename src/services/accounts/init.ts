import { accountService } from './AccountService'

// Seed the user's GitHub accounts on boot. Tokens come from .env.local (VITE_GH_*), which is
// gitignored — they never enter the repo. This upserts: it creates the account if missing AND
// backfills the token/username onto an account that was previously seeded empty, so connecting is
// idempotent. The agent's github tools match by label 'personal' / 'office'.
const SEEDS: { label: string; username: string; token?: string }[] = [
  { label: 'Personal', username: import.meta.env.VITE_PIKU_PERSONAL_GH ?? 'personal-user', token: import.meta.env.VITE_GH_PERSONAL_TOKEN },
  { label: 'Office',   username: import.meta.env.VITE_PIKU_WORK_GH     ?? 'work-user',     token: import.meta.env.VITE_GH_OFFICE_TOKEN },
]

export async function seedAccounts(): Promise<void> {
  const existing = await accountService.getByService('github')
  for (const seed of SEEDS) {
    const current = existing.find(a => a.label.toLowerCase() === seed.label.toLowerCase())
    if (!current) {
      await accountService.create('github', seed.label, seed.token ?? '', { username: seed.username })
      continue
    }
    // backfill token / fix username on an already-seeded account (idempotent connect)
    const needsToken = !!seed.token && current.token !== seed.token
    const needsName  = current.username !== seed.username
    if (needsToken || needsName) {
      await accountService.save({ ...current, token: seed.token ?? current.token, username: seed.username })
    }
  }

  // Dedup: earlier runs left multiple github rows for the same account. Keep ONE per username,
  // preferring a canonical-labelled (Personal/Office), token-bearing entry; remove the rest.
  const canonical = new Set(['personal', 'office'])
  const ranked = (await accountService.getByService('github')).slice().sort((a, b) => {
    const ca = canonical.has(a.label.toLowerCase()) ? 0 : 1
    const cb = canonical.has(b.label.toLowerCase()) ? 0 : 1
    if (ca !== cb) return ca - cb
    return (b.token ? 1 : 0) - (a.token ? 1 : 0)
  })
  const seen = new Set<string>()
  for (const a of ranked) {
    const key = (a.username ?? a.label).toLowerCase()
    if (seen.has(key)) await accountService.delete(a.id)
    else seen.add(key)
  }
}
