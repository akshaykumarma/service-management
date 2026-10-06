// Board auto-refresh settings (Service Board and Demo Board share them). Kept in the
// viewer's own browser: a per-person convenience, not shared state.

export const REFRESH_INTERVALS = [15, 30, 60, 120, 300] as const;
export type RefreshInterval = (typeof REFRESH_INTERVALS)[number];

export interface AutoRefreshPrefs {
  enabled: boolean;
  seconds: RefreshInterval;
}

export const DEFAULT_AUTO_REFRESH: AutoRefreshPrefs = { enabled: true, seconds: 30 };

export const AUTO_REFRESH_STORAGE_KEY = "board-auto-refresh";

export function intervalLabel(seconds: number): string {
  return seconds < 60 ? `${seconds} sec` : `${seconds / 60} min`;
}

/** Reads saved prefs, falling back to the defaults for anything missing or malformed. */
export function parseAutoRefreshPrefs(raw: string | null | undefined): AutoRefreshPrefs {
  if (!raw) return DEFAULT_AUTO_REFRESH;
  try {
    const value = JSON.parse(raw) as Partial<AutoRefreshPrefs>;
    return {
      enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_AUTO_REFRESH.enabled,
      seconds: REFRESH_INTERVALS.includes(value.seconds as RefreshInterval)
        ? (value.seconds as RefreshInterval)
        : DEFAULT_AUTO_REFRESH.seconds,
    };
  } catch {
    return DEFAULT_AUTO_REFRESH;
  }
}

/**
 * Whether a scheduled tick should reload the board now. Skipped while the tab is hidden
 * (no point polling a board nobody sees), mid-drag (a reload would yank the card out from
 * under the pointer) or while a reload is already running.
 */
export function shouldAutoRefresh(state: { enabled: boolean; hidden: boolean; dragging: boolean; inFlight: boolean }): boolean {
  return state.enabled && !state.hidden && !state.dragging && !state.inFlight;
}

/** On returning to the tab: catch up at once if the board missed at least one tick. */
export function isStale(lastUpdatedMs: number | null, nowMs: number, seconds: number): boolean {
  return lastUpdatedMs === null || nowMs - lastUpdatedMs >= seconds * 1000;
}
