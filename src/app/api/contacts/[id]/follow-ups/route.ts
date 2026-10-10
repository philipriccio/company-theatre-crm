import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const followUps = await prisma.contactFollowUp.findMany({
    where: { contactId: id },
    orderBy: [
      { completedAt: { sort: 'asc', nulls: 'first' } },
      { dueDate: { sort: 'asc', nulls: 'last' } },
      { createdAt: 'desc' },
    ],
  })

  return NextResponse.json(followUps)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  if (!body.description?.trim()) {
    return NextResponse.json({ error: 'Description is required' }, { status: 400 })
  }

  const dueDate = body.dueDate ? new Date(body.dueDate) : null
  if (body.dueDate && Number.isNaN(dueDate?.getTime())) {
    return NextResponse.json({ error: 'Invalid dueDate' }, { status: 400 })
  }

  const followUp = await prisma.contactFollowUp.create({
    data: {
      contactId: id,
      description: body.description.trim(),
      dueDate,
      priority: body.priority?.trim() || 'normal',
    },
  })

  return NextResponse.json(followUp, { status: 201 })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: contactId } = await params
  const body = await request.json()

  if (!body.id) {
    return NextResponse.json({ error: 'Follow-up id is required' }, { status: 400 })
  }

  const completedAt = body.completedAt ? new Date(body.completedAt) : new Date()
  if (Number.isNaN(completedAt.getTime())) {
    return NextResponse.json({ error: 'Invalid completedAt' }, { status: 400 })
  }

  const result = await prisma.contactFollowUp.updateMany({
    where: { id: body.id, contactId },
    data: { completedAt },
  })

  if (!result.count) return NextResponse.json({error: 'Follow-up not found for this contact'}, {status:404})
  return NextResponse.json(await prisma.contactFollowUp.findUnique({where:{id:body.id}}))
}
