import { accountService } from './AccountService'

export async function seedAccounts(): Promise<void> {
  const existing = await accountService.getByService('github')
  const existingLabels = new Set(existing.map(a => a.label.toLowerCase()))

  if (!existingLabels.has('personal')) {
    await accountService.create('github', 'Personal', '', { username: 'jaskiring' })
  }
  if (!existingLabels.has('office')) {
    await accountService.create('github', 'Office', '', { username: 'jaskirat-dev1' })
  }
}
