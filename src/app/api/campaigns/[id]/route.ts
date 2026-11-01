import { actorFor, businessEvent } from '@/lib/security/history'
import { guard } from '@/lib/auth/access'
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { draftData } from "@/lib/campaign-draft";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: NextRequest, { params }: Context) {
  const denied = await guard(_request)
  if (denied) return denied

  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  return NextResponse.json(campaign || { error: "Campaign not found" }, {
    status: campaign ? 200 : 404,
  });
}
export async function PUT(request: NextRequest, { params }: Context) {
  const denied = await guard(request)
  if (denied) return denied

  try {
    const { id } = await params;
    const data = draftData(await request.json());
    const actor=await actorFor(request)
    const result=await prisma.$transaction(async tx=>{
    const updated = await tx.campaign.updateMany({
      where: { id, status: "DRAFT" },
      data,
    });
    if(updated.count)await businessEvent(tx,actor,'campaign_draft_updated',id)
    return updated
    })
    if (!result.count)
      return NextResponse.json(
        {
          error:
            "Only existing drafts can be edited. Duplicate this campaign to start a new draft.",
        },
        { status: 409 },
      );
    return NextResponse.json(
      await prisma.campaign.findUnique({ where: { id } }),
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
