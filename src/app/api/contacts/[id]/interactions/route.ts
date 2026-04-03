import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const take = Math.min(parseInt(searchParams.get('take') || '20', 10) || 20, 100)
  const skip = parseInt(searchParams.get('skip') || '0', 10) || 0

  const interactions = await prisma.contactInteraction.findMany({
    where: { contactId: id },
    orderBy: { occurredAt: 'desc' },
    take,
    skip,
  })

  return NextResponse.json(interactions)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  if (!body.type?.trim()) {
    return NextResponse.json({ error: 'Type is required' }, { status: 400 })
  }

  if (!body.occurredAt) {
    return NextResponse.json({ error: 'occurredAt is required' }, { status: 400 })
  }

  const occurredAt = new Date(body.occurredAt)
  if (Number.isNaN(occurredAt.getTime())) {
    return NextResponse.json({ error: 'Invalid occurredAt' }, { status: 400 })
  }

  const interaction = await prisma.contactInteraction.create({
    data: {
      contactId: id,
      type: body.type.trim(),
      subject: body.subject?.trim() || null,
      summary: body.summary?.trim() || null,
      emailId: body.emailId?.trim() || null,
      occurredAt,
    },
  })

  await prisma.contact.update({
    where: { id },
    data: {
      lastContactedAt: occurredAt,
    },
  })

  return NextResponse.json(interaction, { status: 201 })
}
