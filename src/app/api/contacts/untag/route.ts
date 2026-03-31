import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  // Basic auth check
  const auth = request.headers.get('authorization')
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { contactId, tagName } = await request.json()

  if (!contactId || !tagName) {
    return NextResponse.json({ error: 'contactId and tagName required' }, { status: 400 })
  }

  // Find the tag
  const tag = await prisma.tag.findFirst({ where: { name: tagName } })
  if (!tag) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
  }

  // Remove the contact-tag association
  await prisma.contactTag.deleteMany({
    where: {
      contactId,
      tagId: tag.id,
    },
  })

  return NextResponse.json({ success: true })
}
