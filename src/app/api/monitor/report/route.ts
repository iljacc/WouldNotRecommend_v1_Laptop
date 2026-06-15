import { NextRequest, NextResponse } from "next/server";
import { getBotMonitorReport } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId") || undefined;
    return NextResponse.json({ report: getBotMonitorReport(sessionId) });
  } catch (error) {
    console.error("Monitor report failed:", error);
    return NextResponse.json(
      { error: "Failed to build monitor report" },
      { status: 500 },
    );
  }
}
