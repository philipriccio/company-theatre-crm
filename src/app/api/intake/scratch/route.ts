import { NextRequest, NextResponse } from 'next/server'
import { authenticateIntake, IntakeError, parseIntake, recordScratchEntry } from '@/lib/scratch-intake'

export async function POST(request: NextRequest) {
  try {
    authenticateIntake(request.headers.get('authorization'))
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new IntakeError(415, 'JSON required')
    // Bound the stream, not only Content-Length (which a caller can omit or forge).
    const reader = request.body?.getReader()
    if (!reader) throw new IntakeError(400, 'Body required')
    const chunks: Uint8Array[] = []
    let length = 0
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      length += chunk.value.byteLength
      if (length > 16_384) { await reader.cancel(); throw new IntakeError(413, 'Body too large') }
      chunks.push(chunk.value)
    }
    let body: unknown
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
    catch { throw new IntakeError(400, 'Invalid JSON') }
    const result = await recordScratchEntry(parseIntake(body))
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 })
  } catch (error) {
    // Do not log credentials, request bodies, entrant PII, or raw database errors.
    if (error instanceof IntakeError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Intake failed; retry with the same submission ID' }, { status: 500 })
  }
}
