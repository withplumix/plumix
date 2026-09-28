import { orpc } from "@/lib/orpc.js";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, expectTypeOf, test, vi } from "vitest";

import type { AppRouterClient } from "@plumix/core";
import type { Entry } from "@plumix/core/schema";

import { stubRpc } from "./rpc.js";

const updatedAt = new Date("2026-05-20T00:00:00.000Z");

const row: Entry = {
  id: 1,
  type: "author",
  parentId: null,
  title: "Jane Doe",
  slug: "jane-doe",
  content: null,
  excerpt: null,
  status: "draft",
  authorId: 1,
  sortOrder: 0,
  publishedAt: null,
  createdAt: updatedAt,
  updatedAt,
  meta: {},
};

const entry: Awaited<ReturnType<AppRouterClient["entry"]["get"]>> = {
  ...row,
  terms: {},
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("stubRpc", () => {
  test("a Date a responder returns reaches the calling query as a Date", async () => {
    stubRpc({ "entry/get": () => entry });

    const result = await new QueryClient().query(
      orpc.entry.get.queryOptions({ input: { id: 1 } }),
    );

    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toEqual(updatedAt);
  });

  test("a Date the client sends reaches the responder, and the record, as a Date", async () => {
    let seen: Date | undefined;
    const rpc = stubRpc({
      "entry/publish": (input) => {
        seen = input.expectedLiveUpdatedAt;
        return row;
      },
    });

    await orpc.entry.publish.call({ id: 1, expectedLiveUpdatedAt: updatedAt });

    expect(seen).toBeInstanceOf(Date);
    expect(seen).toEqual(updatedAt);
    expect(
      rpc.lastCallTo("entry/publish")?.input.expectedLiveUpdatedAt,
    ).toEqual(updatedAt);
  });

  test("the route map is typed against the core router", () => {
    const rpc = stubRpc({
      "lookup/list": (input) => {
        expectTypeOf(input).toEqualTypeOf<
          Parameters<AppRouterClient["lookup"]["list"]>[0]
        >();
        return { items: [] };
      },
      // @ts-expect-error -- the core router has no `entry/fetch` procedure
      "entry/fetch": () => row,
    });

    stubRpc({
      // @ts-expect-error -- `entry/get` answers an entry, not a bare string
      "entry/get": () => "jane-doe",
    });

    expectTypeOf(rpc.lastCallTo("entry/publish")).toEqualTypeOf<
      | {
          readonly procedure: "entry/publish";
          readonly input: Parameters<AppRouterClient["entry"]["publish"]>[0];
        }
      | undefined
    >();
    // @ts-expect-error -- `lastCallTo` takes only a path the router serves
    rpc.lastCallTo("entry/fetch");
  });
});
