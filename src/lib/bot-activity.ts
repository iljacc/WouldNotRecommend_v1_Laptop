/** Cross-tab activity log for `/terminal` (same origin, same browser profile). */

export const BOT_ACTIVITY_CHANNEL = "gsv-bot-activity";

export type BotActivityMessage = {
  ts: string;
  tag: string;
  lines: string[];
};

type ActivityListener = (message: BotActivityMessage) => void;

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel(BOT_ACTIVITY_CHANNEL);
  }
  return channel;
}

export function postActivity(tag: string, lines: string[]): void {
  const ch = getChannel();
  if (!ch) return;
  const payload: BotActivityMessage = {
    ts: new Date().toISOString(),
    tag,
    lines: lines.length > 0 ? lines : [""],
  };
  ch.postMessage(payload);
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
