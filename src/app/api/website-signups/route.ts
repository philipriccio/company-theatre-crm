import { NextRequest, NextResponse } from 'next/server'
import { authenticateWebsiteSignup, parseWebsiteSignup, recordWebsiteSignup, WebsiteSignupError } from '@/lib/website-signup'

export async function POST(request: NextRequest) {
  try {
    authenticateWebsiteSignup(request.headers.get('x-website-signup-token'))
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new WebsiteSignupError(415, 'JSON required')
    const reader = request.body?.getReader()
    if (!reader) throw new WebsiteSignupError(400, 'Body required')
    const chunks: Uint8Array[] = []
    let length = 0
    const deadline = Date.now() + 5000
    while (true) {
      const chunk = await boundedRead(reader, deadline)
      if (chunk.done) break
      length += chunk.value.byteLength
      if (length > 4096) { await reader.cancel(); throw new WebsiteSignupError(413, 'Body too large') }
      chunks.push(chunk.value)
    }
    let body: unknown
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
    catch { throw new WebsiteSignupError(400, 'Invalid JSON') }
    return NextResponse.json(await recordWebsiteSignup(parseWebsiteSignup(body)), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof WebsiteSignupError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } })
    // Never log credentials, contact PII or database errors.
    return NextResponse.json({ error: 'Unable to record signup; please try again' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}

async function boundedRead(reader: ReadableStreamDefaultReader<Uint8Array>, deadline: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([reader.read(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { void reader.cancel(); reject(new WebsiteSignupError(408, 'Body timeout')) }, Math.max(1, deadline - Date.now()))
    })])
  } finally { clearTimeout(timer) }
}
