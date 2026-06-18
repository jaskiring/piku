export type ServiceType = 'github' | 'gitlab' | 'email' | 'whatsapp' | 'slack' | 'calendar'

export interface ServiceAccount {
  id: string
  service: ServiceType
  label: string
  token: string                // GitHub PAT, or OAuth access token for Gmail
  refreshToken?: string        // OAuth refresh token (Gmail) — mints new access tokens
  tokenExpiresAt?: number      // unix ms when the access token expires
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
