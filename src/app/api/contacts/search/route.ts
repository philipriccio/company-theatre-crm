import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const email = searchParams.get('email')
  const name = searchParams.get('name')

  if (!email && !name) {
    return NextResponse.json({ error: 'email or name parameter required' }, { status: 400 })
  }

  const contacts = await prisma.contact.findMany({
    where: email
      ? { email: { equals: email, mode: 'insensitive' } }
      : { fullName: { contains: name!, mode: 'insensitive' } },
    take: 10,
  })

  return NextResponse.json(contacts)
}
