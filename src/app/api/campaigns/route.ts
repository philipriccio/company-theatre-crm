import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { draftData } from "@/lib/campaign-draft";
export async function GET() {
  return NextResponse.json(
    await prisma.campaign.findMany({ orderBy: { createdAt: "desc" } }),
  );
}
export async function POST(request: NextRequest) {
  try {
    const data = draftData(await request.json());
    return NextResponse.json(
      await prisma.campaign.create({ data: { ...data, status: "DRAFT" } }),
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
