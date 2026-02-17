import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// 1x1 transparent GIF
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Record the open (don't await - fire and forget for speed)
  prisma.campaignRecipient.update({
    where: { id },
    data: { 
      openedAt: new Date(),
    },
  }).catch(() => {
    // Silently ignore errors (recipient might not exist)
  })

  // Return tracking pixel
  return new NextResponse(TRACKING_PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  })
}
