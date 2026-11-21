import { createHash, randomBytes } from 'node:crypto'

// Token opaco de 256 bits; só o hash é persistido no banco.
export function generateAgentToken() {
  return randomBytes(32).toString('base64url')
}

export function hashAgentToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
