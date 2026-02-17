import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const campaign = await prisma.campaign.findUnique({
    where: { id },
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Create a copy with DRAFT status
  const newCampaign = await prisma.campaign.create({
    data: {
      name: `${campaign.name} (Copy)`,
      subject: campaign.subject,
      fromName: campaign.fromName,
      fromEmail: campaign.fromEmail,
      content: campaign.content,
      previewText: campaign.previewText,
      status: 'DRAFT',
    },
  })

  return NextResponse.json({ 
    success: true, 
    id: newCampaign.id 
  })
}
