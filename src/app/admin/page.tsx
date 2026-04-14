"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import destinations from "../../../data/teleport-destinations.json";
import {
  subscribeActivity,
  type BotActivityMessage,
} from "@/lib/bot-activity";
import {
  addSavedWanderArea,
  loadSavedWanderAreas,
  removeSavedWanderArea,
  type SavedWanderArea,
} from "@/lib/admin-saved-areas";
import {
  createDefaultBotSettings,
  getBotSettings,
  isLatLngInWanderRegion,
  postSoftResetSignal,
  reloadBotSettingsFromStorage,
  resetBotSettingsToDefaults,
  saveBotSettings,
  saveFullBotSettings,
  type BotSettings,
  type CustomSpawnPoint,
  type LinkSelectionMode,
  type ReviewSelectionMode,
  type WanderRegion,
} from "@/lib/bot-settings";
import type { SessionStats } from "@/lib/types";

const AdminRegionMap = dynamic(
  () => import("@/components/admin/AdminRegionMap"),
  {
    ssr: false,
    loading: () => (
      <p className="rounded border border-[#2a3328] bg-[#0e100e] p-4 text-xs text-[#6d7a66]">
        Loading map…
      </p>
    ),
  },
);

const ADMIN_SESSION_KEY = "gsv-admin-session";
const MAX_ACTIVITY_LINES = 500;

type HealthResponse = {
  ok: boolean;
  mapsJavascriptApiKeyConfigured: boolean;
  geocodingApiKeyConfigured: boolean;
  placesApiKeyConfigured: boolean;
  databaseOk: boolean;
};

type RecentEntry = {
  id: number;
  timestamp: string;
  businessName: string;
  city: string;
  reviewRating: number;
  reviewText: string;
};

function formatActivity(msg: BotActivityMessage): string[] {
  return msg.lines.map((line) => `${msg.ts} [${msg.tag}] ${line}`);
}

function countDestinationsInRegion(region: WanderRegion): number {
  return destinations.filter((d) =>
    isLatLngInWanderRegion({ lat: d.lat, lng: d.lng }, region),
  ).length;
}

export default function AdminPage() {
  const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD;
  const [unlocked, setUnlocked] = useState(() => !adminPassword);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  const [form, setForm] = useState<BotSettings>(() => getBotSettings());
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [recentDb, setRecentDb] = useState<RecentEntry[]>([]);
  const [activityLines, setActivityLines] = useState<string[]>([]);
  const bottomAct = useRef<HTMLDivElement | null>(null);

  const destCount = useMemo(() => countDestinationsInRegion(form.wanderRegion), [form.wanderRegion]);

  const [savedAreas, setSavedAreas] = useState<SavedWanderArea[]>([]);
  const [presetName, setPresetName] = useState("");
  const [spawnPlacementEnabled, setSpawnPlacementEnabled] = useState(false);

  useEffect(() => {
    setSavedAreas(loadSavedWanderAreas());
  }, []);

  const reloadForm = useCallback(() => {
    reloadBotSettingsFromStorage();
    setForm({ ...getBotSettings() });
  }, []);

  useEffect(() => {
    if (adminPassword && sessionStorage.getItem(ADMIN_SESSION_KEY) === "1") {
      setUnlocked(true);
    }
  }, [adminPassword]);

  useEffect(() => {
    reloadForm();
  }, [reloadForm]);

  useEffect(() => {
    void (async () => {
      try {
        const [h, s, r] = await Promise.all([
          fetch("/api/health").then((res) => res.json() as Promise<HealthResponse>),
          fetch("/api/log").then((res) => res.json() as Promise<SessionStats>),
          fetch("/api/log/recent?limit=40").then(
            (res) => res.json() as Promise<{ entries?: RecentEntry[] }>,
          ),
        ]);
        setHealth(h);
        setStats(s);
        setRecentDb(r.entries || []);
      } catch {
        setHealth(null);
      }
    })();
  }, []);

  useEffect(() => {
    const unsub = subscribeActivity((msg) => {
      setActivityLines((prev) => {
        const next = [...prev, ...formatActivity(msg)];
        if (next.length > MAX_ACTIVITY_LINES) return next.slice(-MAX_ACTIVITY_LINES);
        return next;
      });
    });
    return unsub;
  }, []);

  useEffect(() => {
    bottomAct.current?.scrollIntoView({ behavior: "smooth" });
  }, [activityLines.length]);

  const tryUnlock = () => {
    if (!adminPassword || passwordInput === adminPassword) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
      setUnlocked(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  const applySettings = () => {
    saveFullBotSettings(form);
  };

  const handleResetDefaults = () => {
    resetBotSettingsToDefaults();
    setForm(createDefaultBotSettings());
  };

  const clearLogView = () => setActivityLines([]);

  if (!unlocked) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0c0a] px-4 text-[#b8c4a8]">
        <h1 className="mb-4 font-mono text-lg text-[#e8ece0]">Admin</h1>
        <p className="mb-4 max-w-md text-center text-sm text-[#6d7a66]">
          Enter the admin password (set{" "}
          <code className="text-[#9faa8f]">NEXT_PUBLIC_ADMIN_PASSWORD</code> in
          .env.local). Leave unset to skip this screen in local dev.
        </p>
        <div className="flex w-full max-w-sm gap-2">
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
            className="min-w-0 flex-1 rounded border border-[#2a3328] bg-[#121610] px-3 py-2 font-mono text-sm outline-none focus:border-[#4a5548]"
            placeholder="Password"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={tryUnlock}
            className="rounded bg-[#2a3328] px-4 py-2 font-mono text-sm text-[#e8ece0] hover:bg-[#3a4438]"
          >
            Unlock
          </button>
        </div>
        {passwordError ? (
          <p className="mt-3 text-sm text-red-400/90">Incorrect password.</p>
        ) : null}
      </div>
    );
  }

  const patchTiming = (key: keyof BotSettings["timing"], value: number) => {
    setForm((f) => ({
      ...f,
      timing: { ...f.timing, [key]: value },
    }));
  };

  const patchPlaces = (key: keyof BotSettings["places"], value: number) => {
    setForm((f) => ({
      ...f,
      places: { ...f.places, [key]: value },
    }));
  };

  const patchReviews = (key: keyof BotSettings["reviews"], value: number) => {
    setForm((f) => ({
      ...f,
      reviews: { ...f.reviews, [key]: value },
    }));
  };

  const patchSv = (key: keyof BotSettings["streetView"], value: number | boolean) => {
    setForm((f) => ({
      ...f,
      streetView: { ...f.streetView, [key]: value },
    }));
  };

  const patchRegion = (key: "minLat" | "maxLat" | "minLng" | "maxLng", value: number) => {
    setForm((f) => ({
      ...f,
      wanderRegion: {
        ...f.wanderRegion,
        [key]: value,
        polygonPath: undefined,
      },
    }));
  };

  const setWanderRegion = useCallback((region: WanderRegion) => {
    setForm((f) => ({ ...f, wanderRegion: region }));
  }, []);

  const setSpawnPoints = useCallback((points: CustomSpawnPoint[]) => {
    setForm((f) => ({ ...f, customSpawnPoints: points }));
  }, []);

  const removeSpawnPoint = (id: string) => {
    setForm((f) => ({
      ...f,
      customSpawnPoints: f.customSpawnPoints.filter((p) => p.id !== id),
    }));
  };

  const saveWanderRegionToStorage = () => {
    saveBotSettings({ wanderRegion: form.wanderRegion });
  };

  const saveSpawnPointsToStorage = () => {
    saveBotSettings({ customSpawnPoints: form.customSpawnPoints });
  };

  const saveAreaPreset = () => {
    const list = addSavedWanderArea(presetName, form.wanderRegion);
    setSavedAreas(list);
    setPresetName("");
  };

  const deleteSelectedPreset = (id: string) => {
    const list = removeSavedWanderArea(id);
    setSavedAreas(list);
  };

  const num = (
    label: string,
    value: number,
    onChange: (n: number) => void,
    step = 1,
  ) => (
    <label className="flex flex-col gap-1 font-mono text-xs text-[#8a9688]">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded border border-[#2a3328] bg-[#121610] px-2 py-1.5 text-[#d0dcc8]"
      />
    </label>
  );

  return (
    <div className="min-h-screen bg-[#0a0c0a] pb-16 font-mono text-sm text-[#b8c4a8]">
      <header className="sticky top-0 z-10 border-b border-[#2a3328] bg-[#0a0c0a]/95 px-4 py-3 backdrop-blur">
        <h1 className="text-base text-[#e8ece0]">GSV Bot — admin</h1>
        <p className="mt-1 text-xs text-[#6d7a66]">
          Settings live in localStorage and sync to <code className="text-[#9faa8f]">/bot</code>{" "}
          via BroadcastChannel. Open both tabs in this browser.
        </p>
      </header>

      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-6">
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6d7a66]">
            Health
          </h2>
          <div className="grid gap-2 rounded border border-[#2a3328] bg-[#0e100e] p-4 text-xs">
            {health ? (
              <ul className="space-y-1">
                <li>
                  Maps JS key:{" "}
                  <span className={health.mapsJavascriptApiKeyConfigured ? "text-[#8fbc8f]" : "text-red-400/90"}>
                    {health.mapsJavascriptApiKeyConfigured ? "yes" : "no"}
                  </span>
                </li>
                <li>
                  Geocoding key:{" "}
                  <span className={health.geocodingApiKeyConfigured ? "text-[#8fbc8f]" : "text-[#6d7a66]"}>
                    {health.geocodingApiKeyConfigured ? "yes" : "no"}
                  </span>
                </li>
                <li>
                  Places key:{" "}
                  <span className={health.placesApiKeyConfigured ? "text-[#8fbc8f]" : "text-red-400/90"}>
                    {health.placesApiKeyConfigured ? "yes" : "no"}
                  </span>
                </li>
                <li>
                  Database:{" "}
                  <span className={health.databaseOk ? "text-[#8fbc8f]" : "text-red-400/90"}>
                    {health.databaseOk ? "ok" : "error"}
                  </span>
                </li>
                <li>
                  Overall:{" "}
                  <span className={health.ok ? "text-[#8fbc8f]" : "text-amber-400/90"}>
                    {health.ok ? "ok" : "check keys / DB"}
                  </span>
                </li>
              </ul>
            ) : (
              <p className="text-[#6d7a66]">Loading…</p>
            )}
            <p className="mt-2 text-[#5a6658]">
              Client: NEXT_PUBLIC_MAPS_JAVASCRIPT_API_KEY is{" "}
              {process.env.NEXT_PUBLIC_MAPS_JAVASCRIPT_API_KEY ? "set" : "missing"} (this build).
            </p>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6d7a66]">
            Lifetime stats
          </h2>
          <div className="rounded border border-[#2a3328] bg-[#0e100e] p-4 text-xs">
            {stats ? (
              <ul className="grid gap-1 sm:grid-cols-2">
                <li>Sessions: {stats.totalSessions}</li>
                <li>Reviews read: {stats.totalReviewsRead}</li>
                <li>Reviews today (UTC): {stats.reviewsToday}</li>
                <li>Runtime (s): {Math.round(stats.totalRuntimeSeconds)}</li>
                <li>Distance (km): {stats.totalDistanceKm.toFixed(2)}</li>
                <li>Locations scanned: {stats.totalLocationsScanned}</li>
                <li>Teleports: {stats.totalTeleports}</li>
                <li>Screenshots: {stats.totalScreenshots}</li>
                <li className="sm:col-span-2">
                  Countries: {stats.countriesVisited.join(", ") || "—"}
                </li>
              </ul>
            ) : (
              <p className="text-[#6d7a66]">Loading…</p>
            )}
            <button
              type="button"
              onClick={() => void fetch("/api/log").then((r) => r.json() as Promise<SessionStats>).then(setStats)}
              className="mt-3 rounded border border-[#2a3328] px-3 py-1.5 text-xs text-[#9faa8f] hover:bg-[#1a1e18]"
            >
              Refresh stats
            </button>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6d7a66]">
              Activity log
            </h2>
            <div className="flex max-h-80 flex-col rounded border border-[#2a3328] bg-[#0e100e]">
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {activityLines.length === 0 ? (
                  <p className="text-[#4a5548]">No activity yet — run /bot in another tab.</p>
                ) : (
                  <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                    {activityLines.join("\n")}
                  </pre>
                )}
                <div ref={bottomAct} />
              </div>
              <div className="border-t border-[#2a3328] p-2">
                <button
                  type="button"
                  onClick={clearLogView}
                  className="rounded px-2 py-1 text-xs text-[#9faa8f] hover:bg-[#1a1e18]"
                >
                  Clear view
                </button>
              </div>
            </div>
          </div>
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6d7a66]">
              Recent DB reviews
            </h2>
            <div className="max-h-80 overflow-y-auto rounded border border-[#2a3328] bg-[#0e100e] p-3 text-xs">
              {recentDb.length === 0 ? (
                <p className="text-[#4a5548]">No rows yet.</p>
              ) : (
                <ul className="space-y-3">
                  {recentDb.map((e) => (
                    <li key={e.id} className="border-b border-[#1e221e] pb-2 last:border-0">
                      <div className="text-[#8a9688]">
                        {e.timestamp} · {e.city} · {e.businessName} · {e.reviewRating}★
                      </div>
                      <div className="mt-1 text-[#c4d0b8]">{e.reviewText}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={() =>
                void fetch("/api/log/recent?limit=40")
                  .then((r) => r.json() as Promise<{ entries?: RecentEntry[] }>)
                  .then((d) => setRecentDb(d.entries || []))
              }
              className="mt-2 rounded border border-[#2a3328] px-3 py-1.5 text-xs text-[#9faa8f] hover:bg-[#1a1e18]"
            >
              Refresh DB list
            </button>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6d7a66]">
            Wander region & spawns
          </h2>
          <p className="mb-3 text-xs text-[#6d7a66]">
            Draw a polygon on the map, or use the bounding box fields. Businesses and teleport picks
            filter to this region (polygon when set, otherwise axis-aligned box). Teleport pool:{" "}
            <strong className="text-[#9faa8f]">{destCount}</strong> of {destinations.length}{" "}
            destinations in <code className="text-[#7d8a78]">teleport-destinations.json</code>. If 0,
            the app falls back to the full list (see engine). Custom spawn points override random
            picks from that list when at least one spawn is saved.
          </p>

          {process.env.NEXT_PUBLIC_MAPS_JAVASCRIPT_API_KEY ? (
            <AdminRegionMap
              wanderRegion={form.wanderRegion}
              onWanderRegionChange={setWanderRegion}
              spawnPoints={form.customSpawnPoints}
              onSpawnPointsChange={setSpawnPoints}
              spawnPlacementEnabled={spawnPlacementEnabled}
            />
          ) : (
            <p className="mb-3 rounded border border-[#5a3030] bg-[#1a1510] p-3 text-xs text-amber-200/90">
              Set <code className="text-[#9faa8f]">NEXT_PUBLIC_MAPS_JAVASCRIPT_API_KEY</code> to use
              the map editor.
            </p>
          )}

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex min-w-[12rem] flex-col gap-1 text-xs text-[#8a9688]">
              Saved area presets
              <select
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) return;
                  const found = savedAreas.find((a) => a.id === id);
                  if (found) setWanderRegion(found.region);
                  e.target.value = "";
                }}
                className="rounded border border-[#2a3328] bg-[#121610] px-2 py-1.5 text-[#d0dcc8]"
              >
                <option value="">Load a saved area…</option>
                {savedAreas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-[#8a9688]">
                New preset name
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="e.g. City centre"
                  className="w-48 rounded border border-[#2a3328] bg-[#121610] px-2 py-1.5 text-[#d0dcc8]"
                />
              </label>
              <button
                type="button"
                onClick={saveAreaPreset}
                className="rounded bg-[#3a5a40] px-3 py-2 text-xs text-white hover:bg-[#4a6a50]"
              >
                Save area as preset
              </button>
            </div>
          </div>
          {savedAreas.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-[#6d7a66]">
              {savedAreas.map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <span className="text-[#8a9688]">{a.name}</span>
                  <button
                    type="button"
                    onClick={() => deleteSelectedPreset(a.id)}
                    className="rounded px-2 py-0.5 text-[#d8a0a0] hover:bg-[#2a1818]"
                  >
                    Remove preset
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveWanderRegionToStorage}
              className="rounded bg-[#2d4a35] px-3 py-2 text-xs text-[#e8ece0] hover:bg-[#3a5a40]"
            >
              Save wander region to bot
            </button>
            <button
              type="button"
              onClick={() => setSpawnPlacementEnabled((v) => !v)}
              className={`rounded border px-3 py-2 text-xs ${
                spawnPlacementEnabled
                  ? "border-[#5a8060] bg-[#1a2818] text-[#a8d4a8]"
                  : "border-[#2a3328] text-[#9faa8f] hover:bg-[#1a1e18]"
              }`}
            >
              {spawnPlacementEnabled ? "Stop placing spawns" : "Place spawns on map (click)"}
            </button>
            <button
              type="button"
              onClick={saveSpawnPointsToStorage}
              className="rounded bg-[#2d4a35] px-3 py-2 text-xs text-[#e8ece0] hover:bg-[#3a5a40]"
            >
              Save spawn points to bot
            </button>
          </div>

          <h3 className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-wide text-[#5a6658]">
            Bounding box (clears polygon when edited)
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {num("minLat", form.wanderRegion.minLat, (v) => patchRegion("minLat", v), 0.0001)}
            {num("maxLat", form.wanderRegion.maxLat, (v) => patchRegion("maxLat", v), 0.0001)}
            {num("minLng", form.wanderRegion.minLng, (v) => patchRegion("minLng", v), 0.0001)}
            {num("maxLng", form.wanderRegion.maxLng, (v) => patchRegion("maxLng", v), 0.0001)}
          </div>

          <h3 className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-wide text-[#5a6658]">
            Spawn points ({form.customSpawnPoints.length})
          </h3>
          {form.customSpawnPoints.length === 0 ? (
            <p className="text-xs text-[#5a6658]">
              None — enable “Place spawns on map” and click the map, or rely on teleport
              destinations from JSON.
            </p>
          ) : (
            <ul className="max-h-48 space-y-2 overflow-y-auto rounded border border-[#2a3328] bg-[#0e100e] p-2 text-xs">
              {form.customSpawnPoints.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1a1e18] py-1 last:border-0"
                >
                  <span className="font-mono text-[#a8b4a0]">
                    {p.lat.toFixed(6)}, {p.lng.toFixed(6)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSpawnPoint(p.id)}
                    className="shrink-0 rounded px-2 py-1 text-[#d8a0a0] hover:bg-[#2a1818]"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6d7a66]">
            Selection modes
          </h2>
          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1 text-xs text-[#8a9688]">
              Review pick
              <select
                value={form.reviewSelectionMode}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    reviewSelectionMode: e.target.value as ReviewSelectionMode,
                  }))
                }
                className="rounded border border-[#2a3328] bg-[#121610] px-2 py-1.5 text-[#d0dcc8]"
              >
                <option value="random">random</option>
                <option value="shortest">shortest text</option>
                <option value="longest">longest text</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[#8a9688]">
              Street View link
              <select
                value={form.linkSelectionMode}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    linkSelectionMode: e.target.value as LinkSelectionMode,
                  }))
                }
                className="rounded border border-[#2a3328] bg-[#121610] px-2 py-1.5 text-[#d0dcc8]"
              >
                <option value="forward_wobble">forward + wobble</option>
                <option value="straight">straight (no wobble)</option>
                <option value="random_link">random link</option>
              </select>
            </label>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6d7a66]">
            Timing (ms)
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {num("alignPanMs", form.timing.alignPanMs, (v) => patchTiming("alignPanMs", v))}
            {num("alignHoldMs", form.timing.alignHoldMs, (v) => patchTiming("alignHoldMs", v))}
            {num("reviewAlignDuration", form.timing.reviewAlignDuration, (v) =>
              patchTiming("reviewAlignDuration", v),
            )}
            {num("returnPanDuration", form.timing.returnPanDuration, (v) =>
              patchTiming("returnPanDuration", v),
            )}
            {num("returnStateTimerMs", form.timing.returnStateTimerMs, (v) =>
              patchTiming("returnStateTimerMs", v),
            )}
            {num("wanderStepInterval", form.timing.wanderStepInterval, (v) =>
              patchTiming("wanderStepInterval", v),
            )}
            {num("teleportFadeOut", form.timing.teleportFadeOut, (v) =>
              patchTiming("teleportFadeOut", v),
            )}
            {num("teleportHoldDim", form.timing.teleportHoldDim, (v) =>
              patchTiming("teleportHoldDim", v),
            )}
            {num("teleportFadeIn", form.timing.teleportFadeIn, (v) =>
              patchTiming("teleportFadeIn", v),
            )}
            {num("audioCrossfade", form.timing.audioCrossfade, (v) =>
              patchTiming("audioCrossfade", v),
            )}
            {num("stuckCheckInterval", form.timing.stuckCheckInterval, (v) =>
              patchTiming("stuckCheckInterval", v),
            )}
            {num("stuckDistanceThreshold", form.timing.stuckDistanceThreshold, (v) =>
              patchTiming("stuckDistanceThreshold", v),
            )}
            {num("statsUpdateInterval", form.timing.statsUpdateInterval, (v) =>
              patchTiming("statsUpdateInterval", v),
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6d7a66]">
            Places query
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {num(
              "queryDistanceThreshold (m)",
              form.places.queryDistanceThreshold,
              (v) => patchPlaces("queryDistanceThreshold", v),
            )}
            {num(
              "queryMinInterval (ms)",
              form.places.queryMinInterval,
              (v) => patchPlaces("queryMinInterval", v),
            )}
            {num("searchRadius (m)", form.places.searchRadius, (v) => patchPlaces("searchRadius", v))}
            {num(
              "detectionRadius (m)",
              form.places.detectionRadius,
              (v) => patchPlaces("detectionRadius", v),
            )}
            {num(
              "minStepsBetweenReviews",
              form.places.minStepsBetweenReviews,
              (v) => patchPlaces("minStepsBetweenReviews", v),
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6d7a66]">
            Reviews filter
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {num("minLength", form.reviews.minLength, (v) => patchReviews("minLength", v))}
            {num("maxLength", form.reviews.maxLength, (v) => patchReviews("maxLength", v))}
            {num("targetRating", form.reviews.targetRating, (v) => patchReviews("targetRating", v))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6d7a66]">
            Street View POV / walk
          </h2>
          <div className="mb-3 flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-[#8a9688]">
              <input
                type="checkbox"
                checked={form.streetView.wanderLookFloatEnabled}
                onChange={(e) => patchSv("wanderLookFloatEnabled", e.target.checked)}
              />
              Wander look float
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {num(
              "wanderHeadingWobble",
              form.streetView.wanderHeadingWobble,
              (v) => patchSv("wanderHeadingWobble", v),
            )}
            {num("fov", form.streetView.fov, (v) => patchSv("fov", v))}
            {num("pitch", form.streetView.pitch, (v) => patchSv("pitch", v), 0.1)}
            {num(
              "stepHeadingBlendMs",
              form.streetView.stepHeadingBlendMs,
              (v) => patchSv("stepHeadingBlendMs", v),
            )}
            {num(
              "wanderLookSwayDeg",
              form.streetView.wanderLookSwayDeg,
              (v) => patchSv("wanderLookSwayDeg", v),
              0.1,
            )}
            {num(
              "wanderLookPitchSwayDeg",
              form.streetView.wanderLookPitchSwayDeg,
              (v) => patchSv("wanderLookPitchSwayDeg", v),
              0.1,
            )}
            {num(
              "wanderLookDrift",
              form.streetView.wanderLookDrift,
              (v) => patchSv("wanderLookDrift", v),
              0.01,
            )}
          </div>
        </section>

        <section className="flex flex-wrap gap-3 border-t border-[#2a3328] pt-8">
          <button
            type="button"
            onClick={applySettings}
            className="rounded bg-[#3a5a40] px-4 py-2 text-sm text-white hover:bg-[#4a6a50]"
          >
            Apply settings
          </button>
          <button
            type="button"
            onClick={reloadForm}
            className="rounded border border-[#2a3328] px-4 py-2 text-sm text-[#9faa8f] hover:bg-[#1a1e18]"
          >
            Reload from storage
          </button>
          <button
            type="button"
            onClick={handleResetDefaults}
            className="rounded border border-[#5a3030] px-4 py-2 text-sm text-[#d8a0a0] hover:bg-[#2a1818]"
          >
            Reset settings to defaults
          </button>
          <button
            type="button"
            onClick={() => postSoftResetSignal()}
            className="rounded border border-[#2a3328] px-4 py-2 text-sm text-[#c4b090] hover:bg-[#1a1e18]"
          >
            Soft-reset bot caches
          </button>
        </section>
        <p className="text-xs text-[#5a6658]">
          Soft-reset clears in-memory review hash / place caches on the running bot tab so places can be
          re-tried. For a full session restart, reload <code className="text-[#7d8a78]">/bot</code>.
        </p>
      </div>
    </div>
  );
}
