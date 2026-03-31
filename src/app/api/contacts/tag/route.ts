import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { contactId, tagName } = await request.json()

  if (!contactId || !tagName) {
    return NextResponse.json({ error: 'contactId and tagName required' }, { status: 400 })
  }

  const tag = await prisma.tag.findFirst({ where: { name: tagName } })
  if (!tag) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
  }

  // Check if already tagged
  const existing = await prisma.contactTag.findFirst({
    where: { contactId, tagId: tag.id },
  })

  if (existing) {
    return NextResponse.json({ success: true, message: 'Already tagged' })
  }

  await prisma.contactTag.create({
    data: {
      contactId,
      tagId: tag.id,
      assignedAt: new Date(),
    },
  })

  return NextResponse.json({ success: true })
}
