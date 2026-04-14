import { NextRequest, NextResponse } from "next/server";
import { getRecentReviewLogs } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") || "30");
    const rows = getRecentReviewLogs(Number.isFinite(limit) ? limit : 30);
    return NextResponse.json({ entries: rows });
  } catch (error) {
    console.error("Recent log error:", error);
    return NextResponse.json({ error: "Failed to read logs", entries: [] }, { status: 500 });
  }
}
