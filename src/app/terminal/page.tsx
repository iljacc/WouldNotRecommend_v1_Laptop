"use client";

import { useEffect, useRef, useState } from "react";
import {
  subscribeActivity,
  type BotActivityMessage,
} from "@/lib/bot-activity";

const MAX_LINES = 500;

function formatEntry(msg: BotActivityMessage): string[] {
  return msg.lines.map(
    (line) => `${msg.ts} [${msg.tag}] ${line}`,
  );
}

export default function TerminalPage() {
  const [lines, setLines] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = subscribeActivity((msg) => {
      setLines((prev) => {
        const next = [...prev, ...formatEntry(msg)];
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
    <div className="flex h-screen w-screen flex-col bg-[#0a0c0a] font-mono text-sm text-[#b8c4a8]">
      <header className="shrink-0 border-b border-[#2a3328] px-4 py-2 text-[#6d7a66]">
        Activity log — keep{" "}
        <code className="text-[#9faa8f]">/bot</code> open in another tab on
        this machine. Timestamps are ISO UTC.
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {lines.length === 0 ? (
          <p className="text-[#4a5548]">
            Waiting for bot activity… (start the experience at /bot)
          </p>
        ) : (
          <pre className="whitespace-pre-wrap break-words">
            {lines.join("\n")}
          </pre>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
