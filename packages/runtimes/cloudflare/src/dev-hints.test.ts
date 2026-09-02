import type { DevErrorHint } from "plumix";
import { describe, expect, test } from "vitest";

import type { ErrorHintHooks } from "./dev-hints.js";
import { registerCloudflareErrorHints } from "./dev-hints.js";

type FilterFn = Parameters<ErrorHintHooks["addFilter"]>[1];

interface RegisteredFilter {
  readonly fn: FilterFn;
  readonly options: {
    readonly plugin?: string | null;
    readonly priority?: number;
  };
}

function fakeHooks(): {
  hooks: ErrorHintHooks;
  registered: RegisteredFilter[];
} {
  const registered: RegisteredFilter[] = [];
  const hooks: ErrorHintHooks = {
    addFilter: (_name, fn, options) => {
      registered.push({ fn, options });
    },
  };
  return { hooks, registered };
}

describe("registerCloudflareErrorHints", () => {
  test("registers exactly one error_page:hints filter at low priority", () => {
    const { hooks, registered } = fakeHooks();
    registerCloudflareErrorHints(hooks);

    expect(registered).toHaveLength(1);
    expect(registered[0]?.options).toEqual({
      plugin: "@plumix/runtime-cloudflare",
      priority: 10,
    });
  });

  test("matches a missing-binding error with a hint naming wrangler.jsonc", () => {
    const { hooks, registered } = fakeHooks();
    registerCloudflareErrorHints(hooks);

    const hints = registered[0]?.fn([], new Error("Missing binding: DB"));

    expect(hints).toHaveLength(1);
    expect(hints?.[0]?.title).toMatch(/binding/i);
    expect(hints?.[0]?.body).toContain("wrangler.jsonc");
  });

  test("appends to, rather than replaces, hints already in the list", () => {
    const { hooks, registered } = fakeHooks();
    registerCloudflareErrorHints(hooks);

    const existing: readonly DevErrorHint[] = [{ title: "core hint" }];
    const hints = registered[0]?.fn(existing, new Error("no binding named DB"));

    expect(hints?.[0]).toBe(existing[0]);
    expect(hints).toHaveLength(2);
  });

  test("contributes nothing for an unrelated error", () => {
    const { hooks, registered } = fakeHooks();
    registerCloudflareErrorHints(hooks);

    expect(registered[0]?.fn([], new Error("no such table: posts"))).toEqual(
      [],
    );
    expect(registered[0]?.fn([], "just a string")).toEqual([]);
  });
});
