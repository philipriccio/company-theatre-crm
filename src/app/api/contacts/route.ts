import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, firstName, lastName, fullName, tags, source } = body

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Check if contact already exists
    const existing = await prisma.contact.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      include: { tags: true },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Contact already exists', contact: existing },
        { status: 409 }
      )
    }

    // Build the contact name
    const contactName = fullName || 
      (firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || email.split('@')[0])

    // Create the contact
    const contact = await prisma.contact.create({
      data: {
        email: email.toLowerCase(),
        fullName: contactName,
        firstName: firstName || null,
        lastName: lastName || null,
        source: source || 'Website',
        tags: tags && tags.length > 0 ? {
          connectOrCreate: tags.map((tagName: string) => ({
            where: { name: tagName },
            create: { name: tagName },
          })),
        } : undefined,
      },
      include: { tags: true },
    })

    return NextResponse.json(contact, { status: 201 })
  } catch (error) {
    console.error('Error creating contact:', error)
    return NextResponse.json(
      { error: 'Failed to create contact' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const email = searchParams.get('email')
  const name = searchParams.get('name')

  // If search params provided, search for contacts
  if (email || name) {
    const contacts = await prisma.contact.findMany({
      where: email
        ? { email: { equals: email, mode: 'insensitive' } }
        : { fullName: { contains: name!, mode: 'insensitive' } },
      take: 20,
    })
    return NextResponse.json(contacts)
  }

  // Otherwise return all contacts (paginated)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const skip = (page - 1) * limit

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      skip,
      take: limit,
      orderBy: { fullName: 'asc' },
    }),
    prisma.contact.count(),
  ])

  return NextResponse.json({
    contacts,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  })
}
