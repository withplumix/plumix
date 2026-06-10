import { afterEach, describe, expect, test } from "vitest";

import {
  readRecentNav,
  recordRecentNav,
  selectRecentNavItems,
} from "./recent-nav.js";

const NAV = [{ to: "/media" }, { to: "/users" }, { to: "/settings" }];

describe("selectRecentNavItems", () => {
  test("returns nav items in recency order", () => {
    const recent = selectRecentNavItems(NAV, ["/settings", "/media"], 5);
    expect(recent.map((i) => i.to)).toEqual(["/settings", "/media"]);
  });

  test("caps to the limit", () => {
    const recent = selectRecentNavItems(
      NAV,
      ["/settings", "/media", "/users"],
      2,
    );
    expect(recent.map((i) => i.to)).toEqual(["/settings", "/media"]);
  });

  test("drops recents that are no longer visible nav items", () => {
    const recent = selectRecentNavItems(NAV, ["/gone", "/users"], 5);
    expect(recent.map((i) => i.to)).toEqual(["/users"]);
  });
});

describe("recordRecentNav / readRecentNav", () => {
  test("records most-recent-first", () => {
    recordRecentNav("/media");
    recordRecentNav("/users");
    expect(readRecentNav()).toEqual(["/users", "/media"]);
  });

  test("re-recording moves an entry to the front without duplicating", () => {
    recordRecentNav("/media");
    recordRecentNav("/users");
    recordRecentNav("/media");
    expect(readRecentNav()).toEqual(["/media", "/users"]);
  });

  test("caps the stored list", () => {
    for (let i = 0; i < 12; i++) recordRecentNav(`/p${String(i)}`);
    expect(readRecentNav()).toHaveLength(8);
    expect(readRecentNav()[0]).toBe("/p11");
  });
});

afterEach(() => {
  localStorage.clear();
});
