import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

function normalizeNullableString(value: unknown) {
  if (value === undefined) return undefined
  if (value === null) return null
  const stringValue = String(value).trim()
  return stringValue.length > 0 ? stringValue : null
}

function normalizeDate(value: unknown) {
  if (value === undefined) return undefined
  if (!value) return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? undefined : date
}

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
      firstName: normalizeNullableString(body.firstName),
      lastName: normalizeNullableString(body.lastName),
      fullName: normalizeNullableString(body.fullName),
      title: normalizeNullableString(body.title),
      phone: normalizeNullableString(body.phone),
      city: normalizeNullableString(body.city),
      state: normalizeNullableString(body.state),
      country: normalizeNullableString(body.country),
      solicitation: body.solicitation,
      vip: body.vip,
      relationshipHealth: normalizeNullableString(body.relationshipHealth),
      personalNotes: normalizeNullableString(body.personalNotes),
      organization: normalizeNullableString(body.organization),
      role: normalizeNullableString(body.role),
      context: normalizeNullableString(body.context),
      lastContactedAt: normalizeDate(body.lastContactedAt),
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
