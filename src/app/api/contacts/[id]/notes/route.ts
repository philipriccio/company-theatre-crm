import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const notes = await prisma.contactNote.findMany({
    where: { contactId: id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(notes)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  if (!body.content?.trim()) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 })
  }

  const note = await prisma.contactNote.create({
    data: {
      contactId: id,
      content: body.content.trim(),
      category: body.category?.trim() || 'general',
    },
  })

  return NextResponse.json(note, { status: 201 })
}
