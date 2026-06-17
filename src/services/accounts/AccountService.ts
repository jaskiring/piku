import type { ServiceAccount, ServiceType } from './types'
import { openMemoryDB }                      from '../../features/memory/db'

export class AccountService {
  async getAll(): Promise<ServiceAccount[]> {
    const db = await openMemoryDB()
    return db.getAll('accounts') as Promise<ServiceAccount[]>
  }

  async getByService(service: ServiceType): Promise<ServiceAccount[]> {
    const db = await openMemoryDB()
    return db.getAllFromIndex('accounts', 'service', service) as Promise<ServiceAccount[]>
  }

  async get(id: string): Promise<ServiceAccount | undefined> {
    const db = await openMemoryDB()
    return db.get('accounts', id) as Promise<ServiceAccount | undefined>
  }

  async save(account: ServiceAccount): Promise<void> {
    const db = await openMemoryDB()
    await db.put('accounts', account)
  }

  async delete(id: string): Promise<void> {
    const db = await openMemoryDB()
    await db.delete('accounts', id)
  }

  async create(service: ServiceType, label: string, token: string, opts?: { username?: string; email?: string }): Promise<ServiceAccount> {
    const account: ServiceAccount = {
      id: `${service}::${label.toLowerCase().replace(/\s+/g, '-')}::${Date.now()}`,
      service,
      label,
      token,
      username: opts?.username,
      email: opts?.email,
      enabled: true,
      createdAt: Date.now(),
    }
    await this.save(account)
    return account
  }
}

export const accountService = new AccountService()
