import { NextResponse } from 'next/server'
import { AuthError, changePassword, login, logout, updateProfile, logoutOtherSessions, SESSION_SECONDS } from '@/lib/auth/store'
import { authFailure, authOrigin, cookieName, requestToken, sameOrigin } from '@/lib/auth/access'
import { passwordError } from '@/lib/auth/password'
export const runtime = 'nodejs'
async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw new AuthError(415, 'JSON required.')
  const reader = request.body?.getReader()
  if (!reader) throw new AuthError(400, 'Missing form.')
  const chunks: Uint8Array[] = []; let length = 0
  const timer = setTimeout(() => { void reader.cancel() }, 5000)
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      length += result.value.length
      if (length > 8192) { await reader.cancel(); throw new AuthError(413, 'Form is too large.') }
      chunks.push(result.value)
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid')
    return body
  } catch (error) { if (error instanceof AuthError) throw error; throw new AuthError(400, 'Invalid form. Please try again.') } finally { clearTimeout(timer) }
}
export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  try {
    if (!sameOrigin(request)) throw new AuthError(403, 'Request origin could not be verified.')
    const { action } = await context.params
    let token: string | undefined
    let profile: { name: string } | undefined
    if (action === 'logout') { await logout(requestToken(request)); token = '' }
    else if (action === 'logout-others') await logoutOtherSessions(requestToken(request) ?? '')
    else {
      const body = await readBody(request)
      if (action === 'profile') {
        if (Object.keys(body).some(key => key !== 'name')) throw new AuthError(400, 'Only your name can be changed here.')
        profile = await updateProfile(requestToken(request) ?? '', body.name)
      } else if (action === 'login') token = await login(body.email, body.password)
      else if (action === 'password') {
        const issue = passwordError(body.newPassword)
        if (issue) throw new AuthError(400, issue)
        if (body.newPassword !== body.confirmPassword) throw new AuthError(400, 'The new passwords do not match.')
        token = await changePassword(requestToken(request) ?? '', body.currentPassword, body.newPassword as string)
      } else throw new AuthError(404, 'Account action not found.')
    }
    const response = NextResponse.json({ ok: true, ...profile }, { headers: { 'Cache-Control': 'no-store' } })
    if (token !== undefined) response.cookies.set(cookieName(), token, { httpOnly: true, secure: authOrigin().startsWith('https:'), sameSite: 'lax', path: '/', maxAge: token ? SESSION_SECONDS : 0 })
    return response
  } catch (error) { return authFailure(error) }
}
