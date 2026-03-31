import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = request.nextUrl.searchParams.get('q') || ''
  const excludeTag = request.nextUrl.searchParams.get('excludeTag') || ''

  if (q.length < 2) {
    return NextResponse.json([])
  }

  const where: Record<string, unknown> = {
    OR: [
      { email: { contains: q, mode: 'insensitive' } },
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { fullName: { contains: q, mode: 'insensitive' } },
    ],
  }

  // Exclude contacts already in this tag
  if (excludeTag) {
    where.NOT = {
      tags: { some: { tag: { name: excludeTag } } },
    }
  }

  const contacts = await prisma.contact.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      fullName: true,
    },
    take: 10,
    orderBy: [
      { lastName: { sort: 'asc', nulls: 'last' } },
      { firstName: { sort: 'asc', nulls: 'last' } },
    ],
  })

  return NextResponse.json(contacts)
}
