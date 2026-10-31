import { AuthError, authPool, tokenHash, audit } from './store'
import { requiredMachineScope } from './machine-scopes'
export { MACHINE_SCOPES, requiredMachineScope } from './machine-scopes'
export type { MachineScope } from './machine-scopes'
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
