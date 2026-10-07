import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { draftData } from "@/lib/campaign-draft";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: NextRequest, { params }: Context) {
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  return NextResponse.json(campaign || { error: "Campaign not found" }, {
    status: campaign ? 200 : 404,
  });
}
export async function PUT(request: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const data = draftData(await request.json());
    const result = await prisma.campaign.updateMany({
      where: { id, status: "DRAFT" },
      data,
    });
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
