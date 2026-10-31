import { NextResponse } from 'next/server'
import { identity, AuthError } from './store'
export function authOrigin() {
  const value = process.env.CRM_AUTH_ORIGIN
  if (!value) throw new Error('CRM_AUTH_ORIGIN must be configured')
  const url = new URL(value)
  if (url.origin !== value || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) throw new Error('Invalid auth origin')
  return value
}
export function cookieName() { return authOrigin().startsWith('https:') ? '__Host-crm-session' : 'crm-local-session' }
export function requestToken(request: Request) {
  return request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName()}=`))?.slice(cookieName().length + 1)
}
export function sameOrigin(request: Request) {
  return request.headers.get('origin') === authOrigin() && !['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site') ?? '')
}
export function publicRoute(path: string, method: string) {
  if (method === 'GET' || method === 'HEAD') {
    if (path === '/login' || path === '/favicon.ico' || path.startsWith('/_next/static/')) return true
    if (/^\/unsubscribe\/[^/]+$/.test(path)) return true
    if (/^\/api\/track\/(click|open)\/[^/]+$/.test(path)) return true
  }
  if (method === 'POST' && ['/api/auth/login', '/api/webhooks/ses', '/api/webhooks/sendgrid', '/api/website-signups', '/api/intake/scratch'].includes(path)) return true
  return (method === 'GET' || method === 'POST') && /^\/api\/unsubscribe\/[^/]+$/.test(path)
}
export function authFailure(error: unknown) {
  const status = error instanceof AuthError ? error.status : 503
  return NextResponse.json({ error: error instanceof AuthError ? error.message : 'Account service is unavailable. Please try again.' }, { status, headers: { 'Cache-Control': 'no-store', ...(status === 429 ? { 'Retry-After': '900' } : {}) } })
}
// Called by both the central proxy and every private API route (defence in depth).
export async function guard(request: Request, allowPublic = false) {
  try {
    const path = new URL(request.url).pathname
    if (allowPublic && publicRoute(path, request.method)) return null
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !sameOrigin(request)) throw new AuthError(403, 'Request origin could not be verified.')
    if (!await identity(requestToken(request))) throw new AuthError(401, 'Your session has ended. Sign in again; your unsaved form has not been cleared.')
    return null
  } catch (error) { return authFailure(error) }
}
