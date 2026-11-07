import { describe, expect, test } from "vitest";

import { definePlugin } from "../../plugin/define.js";
import { testSite } from "../../test/site.js";
import { pageNotFound } from "../contract/page-outcome.js";
import { resolveArchiveTypePage } from "./archive-type-page.js";

const archives = definePlugin("archives", {
  setup: (ctx) => {
    ctx.registerEntryType("talk", { label: "Talks", isPublic: true });
    ctx.registerArchiveType("closed-rooms", {
      routes: ["/closed-rooms/:room"],
      entries: (q) => q.ofTypes("talk"),
      title: "Rooms",
      resolve: () => null,
    });
    ctx.registerArchiveType("lost-series", {
      routes: ["/lost-series/:series"],
      resolve: () => {
        throw pageNotFound();
      },
    });
    ctx.registerArchiveType("broken-series", {
      routes: ["/broken-series/:series"],
      resolve: () => {
        throw new Error("resolver broke");
      },
    });
  },
});

const site = await testSite({ plugins: [archives] });

describe("resolveArchiveTypePage", () => {
  test("is null for a listing archive with a declared title whose resolver returns null", async () => {
    const ctx = site.context;

    const page = await resolveArchiveTypePage(ctx, {
      name: "closed-rooms",
      params: { room: "blue" },
    });

    expect(page).toBeNull();
  });

  test("is null when the archive's resolver throws pageNotFound()", async () => {
    const ctx = site.context;

    const page = await resolveArchiveTypePage(ctx, {
      name: "lost-series",
      params: { series: "summer" },
    });

    expect(page).toBeNull();
  });

  test("lets any other error the resolver throws propagate", async () => {
    const ctx = site.context;

    await expect(
      resolveArchiveTypePage(ctx, {
        name: "broken-series",
        params: { series: "summer" },
      }),
    ).rejects.toThrow("resolver broke");
  });
});
