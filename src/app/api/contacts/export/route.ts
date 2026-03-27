import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search') || ''
    const tagFilter = searchParams.get('tag') || ''
    const statusFilter = searchParams.get('status') || ''

    const where = {
      AND: [
        search ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
            { fullName: { contains: search, mode: 'insensitive' as const } },
          ],
        } : {},
        tagFilter ? {
          tags: { some: { tag: { name: tagFilter } } },
        } : {},
        statusFilter === 'subscribed' ? {
          unsubscribedAt: null,
          solicitation: true,
        } : statusFilter === 'unsubscribed' ? {
          OR: [
            { unsubscribedAt: { not: null } },
            { solicitation: false },
          ],
        } : {},
      ],
    }

    const contacts = await prisma.contact.findMany({
      where,
      include: {
        tags: { include: { tag: true } },
      },
      orderBy: [
        { lastName: { sort: 'asc', nulls: 'last' } },
        { firstName: { sort: 'asc', nulls: 'last' } },
      ],
    })

    const headers = ['email', 'firstName', 'lastName', 'fullName', 'city', 'state', 'country', 'solicitation', 'tags', 'createdAt']
    const rows = contacts.map(contact => [
      escapeCsv(contact.email),
      escapeCsv(contact.firstName || ''),
      escapeCsv(contact.lastName || ''),
      escapeCsv(contact.fullName || ''),
      escapeCsv(contact.city || ''),
      escapeCsv(contact.state || ''),
      escapeCsv(contact.country || ''),
      contact.solicitation ? 'true' : 'false',
      escapeCsv(contact.tags.map(t => t.tag.name).join(', ')),
      contact.createdAt.toISOString(),
    ])

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="contacts-export-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  } catch (error) {
    console.error('Error exporting contacts:', error)
    return NextResponse.json(
      { error: 'Failed to export contacts' },
      { status: 500 }
    )
  }
}
