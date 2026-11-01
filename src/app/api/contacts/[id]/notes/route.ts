import { actorFor, businessEvent } from '@/lib/security/history'
import { guard } from '@/lib/auth/access'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await guard(request)
  if (denied) return denied

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
  const denied = await guard(request)
  if (denied) return denied

  const { id } = await params
  const body = await request.json()

  if (!body.content?.trim()) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 })
  }

  const actor=await actorFor(request)
  const note=await prisma.$transaction(async tx=>{
  const created = await tx.contactNote.create({
    data: {
      contactId: id,
      content: body.content.trim(),
      category: body.category?.trim() || 'general',
    },
  })

  await businessEvent(tx,actor,'contact_note_added',id)
  return created
  })
  return NextResponse.json(note, { status: 201 })
}
