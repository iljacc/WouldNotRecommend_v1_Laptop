import type { WanderRegion } from "@/lib/bot-settings";

export const ADMIN_SAVED_WANDER_AREAS_KEY = "gsv-admin-saved-wander-areas";

export type SavedWanderArea = {
  id: string;
  name: string;
  region: WanderRegion;
  createdAt: number;
};

function safeParse(raw: string | null): SavedWanderArea[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(
      (x): x is SavedWanderArea =>
        x !== null &&
        typeof x === "object" &&
        typeof (x as SavedWanderArea).id === "string" &&
        typeof (x as SavedWanderArea).name === "string" &&
        typeof (x as SavedWanderArea).region === "object" &&
        typeof (x as SavedWanderArea).createdAt === "number",
    );
  } catch {
    return [];
  }
}

export function loadSavedWanderAreas(): SavedWanderArea[] {
  if (typeof window === "undefined") return [];
  try {
    return safeParse(localStorage.getItem(ADMIN_SAVED_WANDER_AREAS_KEY));
  } catch {
    return [];
  }
}

export function persistSavedWanderAreas(areas: SavedWanderArea[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ADMIN_SAVED_WANDER_AREAS_KEY, JSON.stringify(areas));
  } catch {
    /* quota */
  }
}

export function addSavedWanderArea(name: string, region: WanderRegion): SavedWanderArea[] {
  const next: SavedWanderArea = {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`,
    name: name.trim() || "Untitled area",
    region,
    createdAt: Date.now(),
  };
  const list = [...loadSavedWanderAreas(), next];
  persistSavedWanderAreas(list);
  return list;
}

export function removeSavedWanderArea(id: string): SavedWanderArea[] {
  const list = loadSavedWanderAreas().filter((a) => a.id !== id);
  persistSavedWanderAreas(list);
  return list;
}
