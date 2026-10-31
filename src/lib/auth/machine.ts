import { AuthError, authPool, tokenHash, audit } from './store'
export const MACHINE_SCOPES = ['contacts:read','contacts:export','contacts:notes','campaigns:read','campaigns:drafts'] as const
export type MachineScope = typeof MACHINE_SCOPES[number]
export function requiredMachineScope(path: string, method: string): MachineScope | null {
  // Deliberately reject encoded separators, fragments, extension tricks and unknown routes.
  if (/%|\\|\.|\/\//.test(path)) return null
  if (method === 'GET' && path === '/api/contacts/export') return 'contacts:export'
  if (method === 'GET' && (/^\/api\/contacts(?:\/[a-zA-Z0-9_-]+)?$/.test(path) || /^\/api\/contacts\/[a-zA-Z0-9_-]+\/(notes|interactions|follow-ups|connections|tags)$/.test(path))) return 'contacts:read'
  if (method === 'POST' && /^\/api\/contacts\/[a-zA-Z0-9_-]+\/notes$/.test(path)) return 'contacts:notes'
  if (method === 'GET' && (/^\/api\/campaigns(?:\/[a-zA-Z0-9_-]+)?$/.test(path) || /^\/api\/campaigns\/(?:analytics\/export|[a-zA-Z0-9_-]+\/(?:analytics\/export|status|copy))$/.test(path))) return 'campaigns:read'
  if (method === 'POST' && path === '/api/campaigns') return 'campaigns:drafts'
  if (method === 'PUT' && /^\/api\/campaigns\/[a-zA-Z0-9_-]+$/.test(path)) return 'campaigns:drafts'
  if (method === 'PUT' && /^\/api\/campaigns\/[a-zA-Z0-9_-]+\/copy$/.test(path)) return 'campaigns:drafts'
  return null
}
export async function authorizeMachine(request: Request, record = true) {
  const token = request.headers.get('x-crm-machine-token') ?? ''
  if (!/^mcrm_[a-f0-9]{64}$/.test(token)) throw new AuthError(401,'Machine credential not recognised.')
  const found = await authPool.query('SELECT "id","scopes" FROM "CrmMachineIdentity" WHERE "tokenHash"=$1 AND NOT "disabled" AND "expiresAt">NOW()', [tokenHash(token)])
  const machine = found.rows[0]
  if (!machine) throw new AuthError(401,'Machine credential not recognised.')
  const scope = requiredMachineScope(new URL(request.url).pathname,request.method)
  if (!scope || !machine.scopes.includes(scope)) {
    await audit('machine_scope_denied', machine.id, {method:request.method, scope:scope ?? 'not_available'})
    throw new AuthError(403,'This machine identity cannot perform that action.')
  }
  // Headers alone never prove a browser is trusted; reject ambient credential mixing.
  if (request.headers.get('cookie') || request.headers.get('origin')) throw new AuthError(403,'Machine credentials cannot be mixed with browser credentials.')
  if (record) await audit('machine_authorized_request',machine.id,{method:request.method,scope})
  return machine.id as string
}
