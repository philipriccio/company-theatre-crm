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
