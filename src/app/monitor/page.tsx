"use client";

import { useEffect, useMemo, useState } from "react";
import type { BotMonitorEvent, BotMonitorReport } from "@/lib/types";

type MonitorResponse = {
  report?: BotMonitorReport;
  error?: string;
};

const POLL_MS = 10_000;

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function lineFor(event: BotMonitorEvent): string {
  const status = event.statusCode ? ` status=${event.statusCode}` : "";
  const coords =
    event.lat !== null && event.lng !== null
      ? ` lat=${event.lat.toFixed(6)} lng=${event.lng.toFixed(6)}`
      : "";
  return `${formatClock(event.timestamp)} [${event.tag}]${status}${coords} ${event.message}`;
}

function warningClass(level: string): string {
  if (level === "critical") return "border-[#ff6464] bg-[#3b1111] text-[#ffd4d4]";
  if (level === "warning") return "border-[#d8a441] bg-[#32220a] text-[#f7dfab]";
  return "border-[#6f8d99] bg-[#0d2630] text-[#cbe8f0]";
}

export default function MonitorPage() {
  const [report, setReport] = useState<BotMonitorReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/monitor/report", { cache: "no-store" });
        const data = (await res.json()) as MonitorResponse;
        if (cancelled) return;
        if (!res.ok || !data.report) {
          throw new Error(data.error || "Failed to load monitor report.");
        }
        setReport(data.report);
        setUpdatedAt(new Date().toISOString());
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load monitor report.");
        }
      }
    };

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const statusRows = useMemo(() => {
    if (!report) return [];
    return Object.entries(report.statusCounts)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([status, count]) => `${status}: ${count}`);
  }, [report]);

  return (
    <main className="min-h-screen bg-[#080a08] px-4 py-4 font-mono text-[#d7dfc8]">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#243020] pb-3">
          <div>
            <h1 className="text-2xl text-[#f1f6de]">Overnight Monitor</h1>
            <p className="mt-1 text-sm text-[#87947f]">
              Persistent bot events, imagery errors, stalls, review droughts.
            </p>
          </div>
          <div className="text-right text-xs text-[#87947f]">
            <div>poll {POLL_MS / 1000}s</div>
            <div>{updatedAt ? `updated ${formatClock(updatedAt)}` : "waiting"}</div>
          </div>
        </header>

        {error ? (
          <div className="border border-[#ff6464] bg-[#3b1111] p-3 text-[#ffd4d4]">
            {error}
          </div>
        ) : null}

        {report ? (
          <>
            <section className="grid gap-3 md:grid-cols-4">
              <Metric label="Session" value={report.sessionId || "none"} wide />
              <Metric label="Runtime" value={formatDuration(report.runtimeSeconds)} />
              <Metric label="Events" value={String(report.totalEvents)} />
              <Metric label="Reviews" value={String(report.reviewsRead)} />
              <Metric label="Teleports" value={String(report.teleports)} />
              <Metric label="Maps errors" value={String(report.mapsErrors)} />
              <Metric label="Boundary" value={String(report.boundaryEvents)} />
              <Metric
                label="Runtime signals"
                value={`${report.runtimeEvents} / ${report.runtimeHeartbeatGaps} / ${report.runtimeHiddenEvents}`}
              />
              <Metric
                label="429 / 503"
                value={`${report.statusCounts[429] ?? 0} / ${
                  report.statusCounts[503] ?? 0
                }`}
              />
            </section>

            <section className="grid gap-3 lg:grid-cols-[1fr_1fr]">
              <div>
                <h2 className="mb-2 text-sm uppercase text-[#87947f]">Warnings</h2>
                {report.warnings.length === 0 ? (
                  <div className="border border-[#263121] bg-[#10140f] p-3 text-[#9fb08f]">
                    No suspicious monitor conditions detected.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {report.warnings.map((warning) => (
                      <div
                        key={`${warning.code}-${warning.message}`}
                        className={`border p-3 ${warningClass(warning.level)}`}
                      >
                        <div className="text-xs uppercase">{warning.level}</div>
                        <div className="mt-1">{warning.message}</div>
                        {warning.since ? (
                          <div className="mt-1 text-xs opacity-75">
                            since {formatClock(warning.since)}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-3">
                <SummaryBlock
                  title="Latest Review"
                  event={report.lastReview}
                  empty="No review selected in this session."
                />
                <SummaryBlock
                  title="Latest Error Signal"
                  event={report.lastError}
                  empty="No error-like event recorded."
                />
                <SummaryBlock
                  title="Latest Runtime Signal"
                  event={report.lastRuntime}
                  empty="No runtime visibility/heartbeat signal recorded."
                />
                <div className="border border-[#263121] bg-[#10140f] p-3">
                  <h2 className="text-sm uppercase text-[#87947f]">HTTP Status Counts</h2>
                  <p className="mt-2 text-sm text-[#d7dfc8]">
                    {statusRows.length > 0 ? statusRows.join("  ") : "none"}
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="mb-2 text-sm uppercase text-[#87947f]">Event Tail</h2>
              <div className="max-h-[48vh] overflow-y-auto border border-[#263121] bg-[#050705] p-3 text-xs leading-5 text-[#b8c4a8]">
                {report.recentEvents.length === 0 ? (
                  <p className="text-[#687464]">No events yet. Start `/bot`.</p>
                ) : (
                  report.recentEvents.map((event) => (
                    <div
                      key={event.id}
                      className={
                        event.statusCode === 429 || event.statusCode === 503
                          ? "text-[#ffd4a3]"
                          : event.tag === "TELEPORT"
                            ? "text-[#d7b7f0]"
                            : event.tag === "MAPS"
                              ? "text-[#b4d8ff]"
                              : event.tag === "RUNTIME"
                                ? "text-[#c7d7a6]"
                                : undefined
                      }
                    >
                      {lineFor(event)}
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        ) : (
          <div className="border border-[#263121] bg-[#10140f] p-3 text-[#87947f]">
            Loading monitor report...
          </div>
        )}
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`min-w-0 border border-[#263121] bg-[#10140f] p-3 ${
        wide ? "md:col-span-2" : ""
      }`}
    >
      <div className="text-xs uppercase text-[#87947f]">{label}</div>
      <div className="mt-2 truncate text-xl text-[#f1f6de]" title={value}>
        {value}
      </div>
    </div>
  );
}

function SummaryBlock({
  title,
  event,
  empty,
}: {
  title: string;
  event: BotMonitorEvent | null;
  empty: string;
}) {
  return (
    <div className="border border-[#263121] bg-[#10140f] p-3">
      <h2 className="text-sm uppercase text-[#87947f]">{title}</h2>
      <p className="mt-2 text-sm leading-5 text-[#d7dfc8]">
        {event ? lineFor(event) : empty}
      </p>
    </div>
  );
}
