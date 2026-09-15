import { ORPCError } from "@orpc/client";
import * as v from "valibot";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  test,
  vi,
} from "vitest";

import { base } from "@plumix/core";

import { createPluginRpcClient } from "./plugin-rpc.js";

// The shape a plugin's server module hands `registerRpcRouter`. Only its type
// is under test: the handlers never run, the stub answers at the fetch
// boundary.
const _menuRouter = {
  list: base.handler((): readonly { id: number }[] => []),
  get: base
    .input(v.object({ termId: v.number() }))
    .handler(({ input }): { id: number; slug: string } => ({
      id: input.termId,
      slug: "main",
    })),
  locations: {
    list: base.handler((): readonly { id: string }[] => []),
  },
};
type MenuRouter = typeof _menuRouter;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify({ json: body, meta: [] }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function firstRequest(
  fetchMock: ReturnType<
    typeof vi.fn<(request: Request, init?: RequestInit) => Promise<Response>>
  >,
): Request {
  const call = fetchMock.mock.calls[0];
  if (!call) throw new Error("fetch was not called");
  return call[0];
}

beforeEach(() => {
  vi.stubGlobal("location", new URL("https://cms.example/admin"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createPluginRpcClient", () => {
  test("posts to /_plumix/rpc/<pluginId>/<procedure path> with the wire envelope", async () => {
    const fetchMock = vi.fn(
      (_request: Request, _init?: RequestInit): Promise<Response> =>
        Promise.resolve(jsonResponse([{ id: "primary" }])),
    );
    vi.stubGlobal("fetch", fetchMock);

    const rpc = createPluginRpcClient<MenuRouter>("menu");
    const result = await rpc.locations.list();

    expect(result).toEqual([{ id: "primary" }]);
    const request = firstRequest(fetchMock);
    expect(request.url).toBe(
      "https://cms.example/_plumix/rpc/menu/locations/list",
    );
    expect(request.method).toBe("POST");
    expect(request.headers.get("x-plumix-request")).toBe("1");
  });

  test("sends the procedure's input as the envelope's json", async () => {
    const fetchMock = vi.fn(
      (_request: Request, _init?: RequestInit): Promise<Response> =>
        Promise.resolve(jsonResponse({ id: 7, slug: "main" })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const rpc = createPluginRpcClient<MenuRouter>("menu");
    const result = await rpc.get({ termId: 7 });

    expect(result).toEqual({ id: 7, slug: "main" });
    const body = JSON.parse(await firstRequest(fetchMock).text()) as {
      json?: unknown;
    };
    expect(body.json).toEqual({ termId: 7 });
  });

  test("procedure names, inputs and outputs come from the router type", () => {
    const rpc = createPluginRpcClient<MenuRouter>("menu");

    expectTypeOf(rpc.get).parameter(0).toEqualTypeOf<{ termId: number }>();
    expectTypeOf(rpc.get).returns.resolves.toEqualTypeOf<{
      id: number;
      slug: string;
    }>();
    expectTypeOf(rpc.locations.list).returns.resolves.toEqualTypeOf<
      readonly { id: string }[]
    >();
    // @ts-expect-error — no such procedure on the router
    expectTypeOf(rpc.remove).toBeFunction();
    // @ts-expect-error — `termId` is a number on the wire
    expectTypeOf(rpc.get).toBeCallableWith({ termId: "7" });
  });

  test("prefixes the URL with the site's subdirectory basePath", async () => {
    (globalThis as { plumix?: { basePath?: string } }).plumix = {
      basePath: "/blog",
    };
    const fetchMock = vi.fn(
      (_request: Request, _init?: RequestInit): Promise<Response> =>
        Promise.resolve(jsonResponse([])),
    );
    vi.stubGlobal("fetch", fetchMock);

    const rpc = createPluginRpcClient<MenuRouter>("menu");
    await rpc.list();

    const request = firstRequest(fetchMock);
    expect(request.url).toBe("https://cms.example/blog/_plumix/rpc/menu/list");
    delete (globalThis as { plumix?: unknown }).plumix;
  });

  test("a server error throws the real ORPCError, with `.data` intact", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_request: Request, _init?: RequestInit): Promise<Response> =>
        Promise.resolve(
          jsonResponse(
            {
              defined: false,
              code: "CONFLICT",
              status: 409,
              message: "Conflict",
              data: { reason: "version_mismatch", key: "4" },
            },
            409,
          ),
        ),
      ),
    );

    const rpc = createPluginRpcClient<MenuRouter>("menu");
    const error = await rpc
      .get({ termId: 4 })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ORPCError);
    expect((error as InstanceType<typeof ORPCError>).data).toEqual({
      reason: "version_mismatch",
      key: "4",
    });
  });
});
