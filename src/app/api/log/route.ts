import { NextRequest, NextResponse } from "next/server";
import {
  addCountry,
  createSession,
  getStats,
  insertReviewLog,
  updateSession,
} from "@/lib/db";
import type { ReviewLogEntry } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(getStats());
  } catch (error) {
    console.error("Failed to get stats:", error);
    return NextResponse.json({ error: "Failed to get stats" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      action?: string;
      sessionId?: string;
      updates?: Parameters<typeof updateSession>[1];
      entry?: ReviewLogEntry;
      country?: string;
    };

    switch (body.action) {
      case "createSession":
        if (!body.sessionId) {
          return NextResponse.json({ error: "sessionId required" }, { status: 400 });
        }
        createSession(body.sessionId);
        return NextResponse.json({ ok: true });

      case "updateSession":
        if (!body.sessionId || !body.updates) {
          return NextResponse.json(
            { error: "sessionId and updates required" },
            { status: 400 },
          );
        }
        updateSession(body.sessionId, body.updates);
        return NextResponse.json({ ok: true });

      case "logReview":
        if (!body.entry) {
          return NextResponse.json({ error: "entry required" }, { status: 400 });
        }
        insertReviewLog(body.entry);
        return NextResponse.json({ ok: true });

      case "addCountry":
        if (!body.country) {
          return NextResponse.json({ error: "country required" }, { status: 400 });
        }
        addCountry(body.country);
        return NextResponse.json({ ok: true });

      default:
        return NextResponse.json(
          { error: `Unknown action: ${body.action ?? "missing"}` },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("Log API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
