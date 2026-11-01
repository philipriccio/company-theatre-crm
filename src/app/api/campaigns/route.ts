import { actorFor, businessEvent } from '@/lib/security/history'
import { guard } from '@/lib/auth/access'
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { draftData } from "@/lib/campaign-draft";
export async function GET(request: Request) {
  const denied = await guard(request)
  if (denied) return denied

  return NextResponse.json(
    await prisma.campaign.findMany({ orderBy: { createdAt: "desc" } }),
  );
}
export async function POST(request: NextRequest) {
  const denied = await guard(request)
  if (denied) return denied

  try {
    const data = draftData(await request.json());
    const actor=await actorFor(request)
    const draft=await prisma.$transaction(async tx=>{
      const created=await tx.campaign.create({data:{...data,status:'DRAFT'}})
      await businessEvent(tx,actor,'campaign_draft_created',created.id)
      return created
    })
    return NextResponse.json(
      draft,
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to save draft",
      },
      { status: 400 },
    );
  }
}
