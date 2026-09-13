import { ORPCError } from "@orpc/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createPluginRpcClient } from "./plugin-rpc.js";

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
  test("posts to /_plumix/rpc/<pluginId>/<procedure> with the wire envelope", async () => {
    const fetchMock = vi.fn(
      (_request: Request, _init?: RequestInit): Promise<Response> =>
        Promise.resolve(jsonResponse({ id: 1 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const rpc = createPluginRpcClient("menu");
    const result = await rpc.call<{ id: number }>("locations/list", {
      termId: 7,
    });

    expect(result).toEqual({ id: 1 });
    const request = firstRequest(fetchMock);
    expect(request.url).toBe(
      "https://cms.example/_plumix/rpc/menu/locations/list",
    );
    expect(request.method).toBe("POST");
    expect(request.headers.get("x-plumix-request")).toBe("1");
    const body = JSON.parse(await request.text()) as { json?: unknown };
    expect(body.json).toEqual({ termId: 7 });
  });

  test("prefixes the URL with the site's subdirectory basePath", async () => {
    (globalThis as { plumix?: { basePath?: string } }).plumix = {
      basePath: "/blog",
    };
    const fetchMock = vi.fn(
      (_request: Request, _init?: RequestInit): Promise<Response> =>
        Promise.resolve(jsonResponse({})),
    );
    vi.stubGlobal("fetch", fetchMock);

    const rpc = createPluginRpcClient("menu");
    await rpc.call("list");

    const request = firstRequest(fetchMock);
    expect(request.url).toBe("https://cms.example/blog/_plumix/rpc/menu/list");
    delete (globalThis as { plumix?: unknown }).plumix;
  });

  test("a procedure with no further path segments still resolves to the plugin root", async () => {
    const fetchMock = vi.fn(
      (_request: Request, _init?: RequestInit): Promise<Response> =>
        Promise.resolve(jsonResponse("ok")),
    );
    vi.stubGlobal("fetch", fetchMock);

    const rpc = createPluginRpcClient("og");
    const result = await rpc.call<string>("preview", { entryId: 7 });

    expect(result).toBe("ok");
    const request = firstRequest(fetchMock);
    expect(request.url).toBe("https://cms.example/_plumix/rpc/og/preview");
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

    const rpc = createPluginRpcClient("menu");
    const error = await rpc.call("save", {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ORPCError);
    expect((error as InstanceType<typeof ORPCError>).data).toEqual({
      reason: "version_mismatch",
      key: "4",
    });
  });
});
