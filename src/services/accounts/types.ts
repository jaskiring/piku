export type ServiceType = 'github' | 'gitlab' | 'email' | 'whatsapp' | 'slack' | 'calendar'

export interface ServiceAccount {
  id: string
  service: ServiceType
  label: string
  token: string
  username?: string
  email?: string
  enabled: boolean
  createdAt: number
  lastUsedAt?: number
}

export interface ServiceConnector {
  readonly service: ServiceType
  readonly label: string
  test(account: ServiceAccount): Promise<boolean>
  fetch(account: ServiceAccount, query?: string): Promise<unknown>
}
