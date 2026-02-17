import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const url = request.nextUrl.searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 })
  }

  // Record the click (don't await - redirect immediately)
  prisma.campaignRecipient.update({
    where: { id },
    data: { 
      clickedAt: new Date(),
    },
  }).catch(() => {
    // Silently ignore errors
  })

  // Decode and redirect to the original URL
  const decodedUrl = decodeURIComponent(url)
  
  return NextResponse.redirect(decodedUrl, { status: 302 })
}
