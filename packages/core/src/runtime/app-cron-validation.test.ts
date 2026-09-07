import { describe, expect, test } from "vitest";

import { auth } from "../auth/config.js";
import { plumix } from "../config.js";
import { definePlugin } from "../plugin/define.js";
import { fallback } from "../route/render/template-builders.js";
import { defineTheme } from "../theme.js";
import { buildApp } from "./app.js";

/** A bare `() => {}` trips no-empty-function. */
const noop = (): void => undefined;

const stubAdapter = {
  name: "test" as const,
  createHandler: () => ({ fetch: () => new Response("stub") }),
  generateEntry: () => "",
};
const stubDatabase = { kind: "test", connect: () => ({ db: {} }) } as const;
const stubAuth = auth({
  passkey: { rpName: "t", rpId: "t", origin: "https://t" },
});
const stubTheme = defineTheme({ templates: [fallback(() => null)] });

const appWithTaskCron = (cron: string): Promise<unknown> =>
  buildApp(
    plumix({
      runtime: stubAdapter,
      database: stubDatabase,
      auth: stubAuth,
      theme: stubTheme,
      plugins: [
        definePlugin("reports", (ctx) => {
          ctx.registerScheduledTask({ id: "purge", cron, handler: noop });
        }),
      ],
    }),
  );

// A cron reaches the registry as a free-form string — `auditLog({ retention:
// { purgeAt } })` hands one straight through — so boot is the last place to
// catch one before it becomes a task that silently never fires.
describe("buildApp — scheduled task cron validation", () => {
  test("accepts a portable schedule", async () => {
    await expect(appWithTaskCron("*/5 * * * *")).resolves.toBeDefined();
  });

  test("rejects an unparseable schedule, naming the task and the plugin", async () => {
    await expect(appWithTaskCron("every 5 minutes")).rejects.toThrow(
      /reports:purge/,
    );
    await expect(appWithTaskCron("every 5 minutes")).rejects.toThrow(
      /5 fields/,
    );
  });

  test("rejects a numeric day-of-week, which reads as a different day per runtime", async () => {
    await expect(appWithTaskCron("0 0 * * 1")).rejects.toThrow(/reports:purge/);
    await expect(appWithTaskCron("0 0 * * 1")).rejects.toThrow(/MON/);
  });

  test("accepts a task that declares no cron at all", async () => {
    await expect(
      buildApp(
        plumix({
          runtime: stubAdapter,
          database: stubDatabase,
          auth: stubAuth,
          theme: stubTheme,
          plugins: [
            definePlugin("search", (ctx) => {
              ctx.registerScheduledTask({ id: "drain", handler: noop });
            }),
          ],
        }),
      ),
    ).resolves.toBeDefined();
  });
});
