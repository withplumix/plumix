import { describe, expect, test } from "vitest";

import {
  readRecentNav,
  recentPaletteItems,
  recordRecentNav,
  selectRecentNavItems,
} from "./recent-nav.js";

const NAV = [{ to: "/media" }, { to: "/users" }, { to: "/settings" }];

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

/** Storage a browser has blocked: every access throws, as Safari's private mode does. */
function blockedStorage(): Pick<Storage, "getItem" | "setItem"> {
  const refuse = (): never => {
    throw new Error("SecurityError: storage is blocked");
  };
  return { getItem: refuse, setItem: refuse };
}

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

describe("recentPaletteItems", () => {
  test("an empty query offers the recent destinations", () => {
    expect(recentPaletteItems("", NAV, ["/users"], 5)).toEqual([
      { to: "/users" },
    ]);
  });

  test("a typed query offers no recent destinations", () => {
    expect(recentPaletteItems("us", NAV, ["/users"], 5)).toEqual([]);
  });
});

describe("recordRecentNav / readRecentNav", () => {
  test("records most-recent-first", () => {
    const storage = memoryStorage();
    recordRecentNav("/media", storage);
    recordRecentNav("/users", storage);
    expect(readRecentNav(storage)).toEqual(["/users", "/media"]);
  });

  test("re-recording moves an entry to the front without duplicating", () => {
    const storage = memoryStorage();
    recordRecentNav("/media", storage);
    recordRecentNav("/users", storage);
    recordRecentNav("/media", storage);
    expect(readRecentNav(storage)).toEqual(["/media", "/users"]);
  });

  test("caps the stored list", () => {
    const storage = memoryStorage();
    recordRecentNav("/a", storage);
    recordRecentNav("/b", storage);
    recordRecentNav("/c", storage);
    recordRecentNav("/d", storage);
    recordRecentNav("/e", storage);
    recordRecentNav("/f", storage);
    recordRecentNav("/g", storage);
    recordRecentNav("/h", storage);
    recordRecentNav("/i", storage);
    expect(readRecentNav(storage)).toEqual([
      "/i",
      "/h",
      "/g",
      "/f",
      "/e",
      "/d",
      "/c",
      "/b",
    ]);
  });

  test("recording to blocked storage is silent", () => {
    expect(() => recordRecentNav("/media", blockedStorage())).not.toThrow();
  });

  test("reading blocked storage reads no recents", () => {
    expect(readRecentNav(blockedStorage())).toEqual([]);
  });
});
