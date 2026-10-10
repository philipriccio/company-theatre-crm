import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({error:'Invalid contact details'}, {status:400})
    const email=typeof body.email==='string'?body.email.trim().toLowerCase():''
    if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\r\n]/.test(email)) return NextResponse.json({error:'Enter a valid email address'}, {status:400})
    for(const key of ['firstName','lastName','fullName','organization','context']) if(body[key] != null && (typeof body[key]!=='string'||body[key].length>500)) return NextResponse.json({error:'Invalid contact details'}, {status:400})
    if(body.tags!==undefined && (!Array.isArray(body.tags)||body.tags.length>50||body.tags.some((t:unknown)=>typeof t!=='string'||!t.trim()||t.length>100))) return NextResponse.json({error:'Invalid tags'}, {status:400})
    const result=await prisma.$transaction(async tx=>{
      await tx.$executeRaw`LOCK TABLE "Contact" IN SHARE ROW EXCLUSIVE MODE`
      const existing=await tx.contact.findFirst({where:{email:{equals:email,mode:'insensitive'}}})
      if(existing) return {duplicate:true,contact:existing}
      const contact=await tx.contact.create({data:{email,firstName:body.firstName?.trim()||null,lastName:body.lastName?.trim()||null,fullName:body.fullName?.trim()||[body.firstName?.trim(),body.lastName?.trim()].filter(Boolean).join(' ')||null,organization:body.organization?.trim()||null,context:body.context?.trim()||null,solicitation:false}})
      for(const name of [...new Set<string>((body.tags||[]).map((t:string)=>t.trim()))]) {const tag=await tx.tag.upsert({where:{name},update:{},create:{name}});await tx.contactTag.create({data:{contactId:contact.id,tagId:tag.id}})}
      return {duplicate:false,contact:await tx.contact.findUnique({where:{id:contact.id},include:{tags:{include:{tag:true}}}})}
    })
    return result.duplicate?NextResponse.json({error:'A person with this email already exists.',contact:result.contact},{status:409}):NextResponse.json(result.contact,{status:201})
  } catch {return NextResponse.json({error:'Could not create this person. Please try again.'},{status:500})}
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
