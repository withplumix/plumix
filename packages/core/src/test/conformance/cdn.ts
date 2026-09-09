import { expect } from "vitest";

import type { ConnectedCdn } from "../../runtime/slots.js";
import type { ContractCase } from "./case.js";
import { describeContract } from "./case.js";

const ORIGIN = "https://conformance.test";

export interface CdnContractOptions {
  /**
   * Bind a cdn for one case. Every case gets its own, so the returned cdn
   * must start empty and must not see entries a previous one stored.
   */
  readonly connect: () => ConnectedCdn | Promise<ConnectedCdn>;
}

type Case = ContractCase<CdnContractOptions>;

function pageRequest(path: string): Request {
  return new Request(`${ORIGIN}${path}`);
}

async function storedBody(
  cdn: ConnectedCdn,
  request: Request,
): Promise<string | undefined> {
  return await (await cdn.match(request))?.text();
}

/** Every case of the cdn contract, for guard tests that run them outside vitest. */
export const cdnContractCases: readonly Case[] = [
  {
    name: "match misses a request that was never stored",
    run: async (options) => {
      const cdn = await options.connect();
      expect(await cdn.match(pageRequest("/never-stored"))).toBeUndefined();
    },
  },
  {
    name: "a stored response comes back on the next match",
    run: async (options) => {
      const cdn = await options.connect();
      const request = pageRequest("/post");
      await cdn.put(request, new Response("rendered", { status: 200 }), []);
      const hit = await cdn.match(request);
      expect(hit?.status).toBe(200);
      expect(await hit?.text()).toBe("rendered");
    },
  },
  {
    name: "a stored response is keyed on its own request",
    run: async (options) => {
      const cdn = await options.connect();
      await cdn.put(pageRequest("/a"), new Response("a"), []);
      expect(await cdn.match(pageRequest("/b"))).toBeUndefined();
    },
  },
  {
    name: "a non-GET request is not stored",
    run: async (options) => {
      const cdn = await options.connect();
      const path = "/submit";
      await cdn.put(
        new Request(`${ORIGIN}${path}`, { method: "POST" }),
        new Response("rendered"),
        [],
      );
      // Probed with a GET rather than the POST itself: what a store does with
      // a non-GET `match` is its own business, and asking it here would make
      // the case pass or fail on that instead of on what was written.
      expect(await storedBody(cdn, pageRequest(path))).toBeUndefined();
    },
  },
  {
    name: "a stored response does not carry the response's Set-Cookie",
    run: async (options) => {
      const cdn = await options.connect();
      const request = pageRequest("/with-cookie");
      const response = new Response("rendered", {
        headers: { "set-cookie": "plumix_session=secret" },
      });
      await cdn.put(request, response, []);
      const hit = await cdn.match(request);
      // `?? null` so declining to store the response at all counts: it is the
      // stricter answer to the same rule, and core's route read-through makes
      // exactly that call before it ever reaches a provider.
      expect(hit?.headers.get("set-cookie") ?? null).toBeNull();
    },
  },
  {
    name: "purging a tag drops every response carrying it",
    run: async (options) => {
      const cdn = await options.connect();
      const one = pageRequest("/one");
      const two = pageRequest("/two");
      await cdn.put(one, new Response("one"), ["t:post", "e:1"]);
      await cdn.put(two, new Response("two"), ["t:post", "e:2"]);
      await cdn.purgeTags(["t:post"]);
      expect(await storedBody(cdn, one)).toBeUndefined();
      expect(await storedBody(cdn, two)).toBeUndefined();
    },
  },
  {
    name: "purging a tag leaves responses that do not carry it",
    run: async (options) => {
      const cdn = await options.connect();
      const tagged = pageRequest("/tagged");
      const other = pageRequest("/other");
      await cdn.put(tagged, new Response("tagged"), ["t:post"]);
      await cdn.put(other, new Response("other"), ["t:page"]);
      await cdn.purgeTags(["t:post"]);
      expect(await storedBody(cdn, tagged)).toBeUndefined();
      expect(await storedBody(cdn, other)).toBe("other");
    },
  },
  {
    name: "purging a tag nothing carries leaves the cdn alone",
    run: async (options) => {
      const cdn = await options.connect();
      const request = pageRequest("/kept");
      await cdn.put(request, new Response("kept"), ["t:page"]);
      await cdn.purgeTags(["t:nothing"]);
      expect(await storedBody(cdn, request)).toBe("kept");
    },
  },
];

/**
 * Assert an implementation of the `cdn:` slot satisfies its port. Call it at
 * the top level of a test file with a factory that binds a fresh cdn.
 */
export function describeCdnContract(options: CdnContractOptions): void {
  describeContract("cdn contract", cdnContractCases, options);
}
