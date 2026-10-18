import { describe, expect, test } from "vitest";

import type { AppContext } from "../../context/app-context.js";
import { HookRegistry } from "../../hooks/registry.js";
import { definePlugin } from "../../plugin/define.js";
import { installPlugins } from "../../runtime/install-plugins.js";
import { createTestContext } from "../../test/context.js";
import { createTestDb } from "../../test/harness.js";
import { pageNotFound } from "../contract/page-outcome.js";
import { resolveArchiveTypePage } from "./archive-type-page.js";

const archives = definePlugin("archives", (ctx) => {
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
});

async function archiveContext(): Promise<AppContext> {
  const { registry } = await installPlugins({
    hooks: new HookRegistry(),
    plugins: [archives],
  });
  return createTestContext({ db: await createTestDb(), plugins: registry });
}

describe("resolveArchiveTypePage", () => {
  test("is null for a listing archive with a declared title whose resolver returns null", async () => {
    const ctx = await archiveContext();

    const page = await resolveArchiveTypePage(ctx, {
      name: "closed-rooms",
      params: { room: "blue" },
    });

    expect(page).toBeNull();
  });

  test("is null when the archive's resolver throws pageNotFound()", async () => {
    const ctx = await archiveContext();

    const page = await resolveArchiveTypePage(ctx, {
      name: "lost-series",
      params: { series: "summer" },
    });

    expect(page).toBeNull();
  });

  test("lets any other error the resolver throws propagate", async () => {
    const ctx = await archiveContext();

    await expect(
      resolveArchiveTypePage(ctx, {
        name: "broken-series",
        params: { series: "summer" },
      }),
    ).rejects.toThrow("resolver broke");
  });
});
