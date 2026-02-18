import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

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
