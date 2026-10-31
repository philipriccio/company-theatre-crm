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
  response.headers.set('Referrer-Policy', 'same-origin')
  response.headers.set('X-Frame-Options', 'SAMEORIGIN')
  return response
}
export const config = { matcher: ['/:path*'] }
