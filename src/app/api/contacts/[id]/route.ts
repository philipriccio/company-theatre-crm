import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const contact = await prisma.contact.findUnique({
    where: { id },
  })

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  return NextResponse.json(contact)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  const contact = await prisma.contact.update({
    where: { id },
    data: {
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      fullName: body.fullName,
      title: body.title,
      phone: body.phone,
      city: body.city,
      state: body.state,
      country: body.country,
      solicitation: body.solicitation,
    },
  })

  return NextResponse.json(contact)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  await prisma.contact.delete({
    where: { id },
  })

  return NextResponse.json({ success: true })
}
