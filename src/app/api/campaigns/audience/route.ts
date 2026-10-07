import { NextRequest, NextResponse } from "next/server";
import { selectAudience } from "@/lib/email/audience";
export async function POST(request: NextRequest) {
  try {
    const { mode, tagIds } = await request.json();
    const { eligible, excluded, matched } = await selectAudience(mode, tagIds);
    return NextResponse.json({ eligible, excluded, matched });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to count audience",
      },
      { status: 400 },
    );
  }
}
