import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const templates = await prisma.template.findMany({
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(templates)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  
  const template = await prisma.template.create({
    data: {
      name: body.name,
      content: body.content,
      isDefault: body.isDefault || false,
    },
  })
  
  return NextResponse.json(template)
}
