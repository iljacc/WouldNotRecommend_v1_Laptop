/** Cross-tab activity log for `/terminal` (same origin, same browser profile). */

export const BOT_ACTIVITY_CHANNEL = "gsv-bot-activity";

export type BotActivityMessage = {
  ts: string;
  tag: string;
  lines: string[];
  sessionId?: string;
  lat?: number;
  lng?: number;
  state?: string;
  statusCode?: number;
  metadata?: Record<string, unknown>;
};

type ActivityListener = (message: BotActivityMessage) => void;

let channel: BroadcastChannel | null = null;
let activeSessionId = "";

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel(BOT_ACTIVITY_CHANNEL);
  }
  return channel;
}

export type BotActivityOptions = {
  sessionId?: string;
  lat?: number;
  lng?: number;
  state?: string;
  statusCode?: number;
  metadata?: Record<string, unknown>;
};

export function setActivitySessionId(sessionId: string): void {
  activeSessionId = sessionId;
}

function persistActivity(message: BotActivityMessage): void {
  if (typeof window === "undefined") return;

  const events = message.lines.map((line) => ({
    sessionId: message.sessionId ?? "",
    timestamp: message.ts,
    tag: message.tag,
    message: line,
    lat: message.lat,
    lng: message.lng,
    state: message.state,
    statusCode: message.statusCode,
    metadata: message.metadata,
  }));
  const body = JSON.stringify({ events });

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon("/api/monitor/events", blob)) return;
  }

  void fetch("/api/monitor/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function postActivity(
  tag: string,
  lines: string[],
  options?: BotActivityOptions,
): void {
  const ch = getChannel();
  const payload: BotActivityMessage = {
    ts: new Date().toISOString(),
    tag,
    lines: lines.length > 0 ? lines : [""],
    sessionId: options?.sessionId ?? activeSessionId,
    lat: options?.lat,
    lng: options?.lng,
    state: options?.state,
    statusCode: options?.statusCode,
    metadata: options?.metadata,
  };
  persistActivity(payload);
  ch?.postMessage(payload);
}

export function subscribeActivity(listener: ActivityListener): () => void {
  const ch = getChannel();
  if (!ch) {
    return () => {};
  }

  const handler = (event: MessageEvent<BotActivityMessage>) => {
    if (!event.data || typeof event.data.ts !== "string") return;
    listener(event.data);
  };

  ch.addEventListener("message", handler);
  return () => {
    ch.removeEventListener("message", handler);
  };
}
