import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { tag: tagName } = body

    if (!tagName) {
      return NextResponse.json(
        { error: 'Tag name is required' },
        { status: 400 }
      )
    }

    // Find or create the tag
    const tag = await prisma.tag.upsert({
      where: { name: tagName },
      update: {},
      create: { name: tagName },
    })

    // Check if relation already exists
    const existingRelation = await prisma.contactTag.findUnique({
      where: {
        contactId_tagId: {
          contactId: id,
          tagId: tag.id,
        },
      },
    })

    if (!existingRelation) {
      // Create the ContactTag relation
      await prisma.contactTag.create({
        data: {
          contactId: id,
          tagId: tag.id,
        },
      })
    }

    // Fetch the contact with tags
    const contact = await prisma.contact.findUnique({
      where: { id },
      include: { tags: { include: { tag: true } } },
    })

    return NextResponse.json(contact)
  } catch (error) {
    console.error('Error adding tag:', error)
    return NextResponse.json(
      { error: 'Failed to add tag' },
      { status: 500 }
    )
  }
}
