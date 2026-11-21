import { NextRequest, NextResponse } from 'next/server'
import { guard } from './lib/auth/access'
export async function proxy(request: NextRequest) {
  const failure = await guard(request, true)
  if (failure) {
    if (failure.status === 401 && !request.nextUrl.pathname.startsWith('/api/')) {
      const response = NextResponse.redirect(new URL('/login', request.url))
      response.headers.set('Cache-Control', 'no-store')
      return response
    }
    return failure
  }
  const response = NextResponse.next()
  if (!request.nextUrl.pathname.startsWith('/_next/static/')) response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', request.nextUrl.pathname === '/set-password' ? 'no-referrer' : 'same-origin')
  if (request.nextUrl.pathname === '/set-password') {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
    response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
  }
  response.headers.set('X-Frame-Options', 'SAMEORIGIN')
  return response
}
export const config = { matcher: ['/:path*'] }
