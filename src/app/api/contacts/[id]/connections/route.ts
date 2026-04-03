import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const connections = await prisma.contactConnection.findMany({
    where: { contactId: id },
    orderBy: [{ createdAt: 'desc' }],
  })

  return NextResponse.json(connections)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  if (!body.name?.trim() || !body.relationship?.trim()) {
    return NextResponse.json({ error: 'Name and relationship are required' }, { status: 400 })
  }

  const connection = await prisma.contactConnection.create({
    data: {
      contactId: id,
      connectedId: body.connectedId?.trim() || null,
      name: body.name.trim(),
      relationship: body.relationship.trim(),
      notes: body.notes?.trim() || null,
    },
  })

  return NextResponse.json(connection, { status: 201 })
}
