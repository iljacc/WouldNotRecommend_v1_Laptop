import { NextRequest, NextResponse } from "next/server";
import { getRecentBotEvents, insertBotEvent } from "@/lib/db";
import type { BotMonitorEventInput } from "@/lib/types";

export const runtime = "nodejs";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function cleanEvent(input: BotMonitorEventInput): BotMonitorEventInput {
  return {
    sessionId: typeof input.sessionId === "string" ? input.sessionId : "",
    timestamp:
      typeof input.timestamp === "string" && input.timestamp
        ? input.timestamp
        : new Date().toISOString(),
    tag: String(input.tag || "UNKNOWN").slice(0, 40),
    message: String(input.message || "").slice(0, 4000),
    lat: isFiniteNumber(input.lat) ? input.lat : undefined,
    lng: isFiniteNumber(input.lng) ? input.lng : undefined,
    state: typeof input.state === "string" ? input.state.slice(0, 40) : "",
    statusCode: isFiniteNumber(input.statusCode)
      ? Math.floor(input.statusCode)
      : undefined,
    metadata:
      input.metadata && typeof input.metadata === "object"
        ? input.metadata
        : undefined,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId") || undefined;
    const limit = Number(searchParams.get("limit") || "200");
    const events = getRecentBotEvents({
      sessionId,
      limit: Number.isFinite(limit) ? limit : 200,
    });
    return NextResponse.json({ events });
  } catch (error) {
    console.error("Monitor events read failed:", error);
    return NextResponse.json(
      { error: "Failed to read monitor events", events: [] },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      events?: BotMonitorEventInput[];
    } & BotMonitorEventInput;
    const events = Array.isArray(body.events) ? body.events : [body];

    for (const event of events) {
      insertBotEvent(cleanEvent(event));
    }

    return NextResponse.json({ ok: true, inserted: events.length });
  } catch (error) {
    console.error("Monitor events write failed:", error);
    return NextResponse.json(
      { error: "Failed to write monitor event" },
      { status: 500 },
    );
  }
}
