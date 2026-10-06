import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTO_REFRESH,
  intervalLabel,
  isStale,
  parseAutoRefreshPrefs,
  shouldAutoRefresh,
} from "@/lib/board/auto-refresh";

describe("Board auto-refresh settings", () => {
  it("defaults to on, every 30 seconds", () => {
    expect(parseAutoRefreshPrefs(null)).toEqual({ enabled: true, seconds: 30 });
  });

  it("keeps valid saved prefs and repairs bad ones", () => {
    expect(parseAutoRefreshPrefs('{"enabled":false,"seconds":60}')).toEqual({ enabled: false, seconds: 60 });
    expect(parseAutoRefreshPrefs('{"enabled":false,"seconds":7}')).toEqual({ enabled: false, seconds: 30 });
    expect(parseAutoRefreshPrefs('{"seconds":15}')).toEqual({ enabled: true, seconds: 15 });
    expect(parseAutoRefreshPrefs("not json")).toEqual(DEFAULT_AUTO_REFRESH);
  });

  it("only refreshes when on, visible, not dragging and not already loading", () => {
    const base = { enabled: true, hidden: false, dragging: false, inFlight: false };
    expect(shouldAutoRefresh(base)).toBe(true);
    expect(shouldAutoRefresh({ ...base, enabled: false })).toBe(false);
    expect(shouldAutoRefresh({ ...base, hidden: true })).toBe(false);
    expect(shouldAutoRefresh({ ...base, dragging: true })).toBe(false);
    expect(shouldAutoRefresh({ ...base, inFlight: true })).toBe(false);
  });

  it("treats the board as stale once a full interval has passed", () => {
    expect(isStale(null, 1_000, 30)).toBe(true);
    expect(isStale(0, 29_999, 30)).toBe(false);
    expect(isStale(0, 30_000, 30)).toBe(true);
  });

  it("labels intervals", () => {
    expect(intervalLabel(15)).toBe("15 sec");
    expect(intervalLabel(120)).toBe("2 min");
  });
});
