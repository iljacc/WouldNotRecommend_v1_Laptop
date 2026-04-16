"use client";

import { useEffect, useRef, useState } from "react";
import {
  subscribeActivity,
  type BotActivityMessage,
} from "@/lib/bot-activity";

const MAX_LINES = 500;

/** Fluid type: tracks viewport “resolution” via vmin + vw/vh blend, with sane min/max. */
const TERMINAL_VIEW_STYLE = {
  fontSize:
    "clamp(0.859375rem, calc(min(1.3125vw, 2.4375vh) + 0.4375rem), 1.5625rem)",
  lineHeight: 1.45,
} as const;

function formatLine(msg: BotActivityMessage, line: string): string {
  return `${msg.ts} [${msg.tag}] ${line}`;
}

type LineRow = { id: string; tag: string; text: string };

export default function TerminalPage() {
  const [lines, setLines] = useState<LineRow[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const idRef = useRef(0);

  useEffect(() => {
    const unsub = subscribeActivity((msg) => {
      setLines((prev) => {
        const rows: LineRow[] = msg.lines.map((line) => ({
          id: `l-${++idRef.current}`,
          tag: msg.tag,
          text: formatLine(msg, line),
        }));
        const next = [...prev, ...rows];
        if (next.length > MAX_LINES) {
          return next.slice(-MAX_LINES);
        }
        return next;
      });
    });
    return unsub;
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  return (
    <div
      className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#0a0c0a] font-mono text-[#b8c4a8]"
      style={TERMINAL_VIEW_STYLE}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-2">
        {lines.length === 0 ? (
          <p className="text-[#4a5548]">
            Waiting for bot activity… (start the experience at /bot)
          </p>
        ) : (
          <div className="whitespace-pre-wrap break-words [word-break:break-word]">
            {lines.map((row) => (
              <div
                key={row.id}
                className={
                  row.tag === "TELEPORT"
                    ? "text-[#c9a8e6]"
                    : row.tag === "STATE"
                      ? "text-[#9ab89a]"
                      : undefined
                }
              >
                {row.text}
              </div>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
