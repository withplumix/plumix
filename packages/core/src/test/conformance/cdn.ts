import { expect } from "vitest";

import type { CdnStore, ConnectedCdn } from "../../runtime/slots.js";
import type { ContractCase } from "./case.js";
import { describeContract } from "./case.js";

const ORIGIN = "https://conformance.test";

export interface CdnContractOptions {
  /**
   * Bind a cdn for one case. Every case gets its own, so the returned cdn
   * must start empty and must not see entries a previous one stored.
   */
  readonly connect: () => ConnectedCdn | Promise<ConnectedCdn>;
  /**
   * Whether this provider ships an origin-side response store. Declared rather
   * than probed because `skip` runs before any connection exists — the first
   * case asserts the declaration against a real one, so it cannot drift.
   */
  readonly store?: boolean;
  /** Whether this provider ships tag purge. Declared like {@link store}. */
  readonly purgeTags?: boolean;
}

type Case = ContractCase<CdnContractOptions>;

function pageRequest(path: string): Request {
  return new Request(`${ORIGIN}${path}`);
}

// The provider owns its header names and its tag separator, so the contract
// asks whether the tag reached the response at all rather than which header
// carries it — a vendor using `Surrogate-Key` satisfies the rule too.
function carriesTag(response: Response, tag: string): boolean {
  for (const [, value] of response.headers) {
    if (value.includes(tag)) return true;
  }
  return false;
}

function headerPairs(response: Response): string[] {
  return [...response.headers].map(([name, value]) => `${name}: ${value}`);
}

function needsStore(options: CdnContractOptions): string | null {
  return options.store === true ? null : "the provider has no origin store";
}

// A purge is observable in-process only through a store the contract can read
// back. A storeless provider's purge reaches the vendor's own cache, which
// nothing here can see.
function needsStoredPurge(options: CdnContractOptions): string | null {
  if (options.purgeTags !== true) return "the provider cannot purge by tag";
  return needsStore(options);
}

async function storedBody(
  store: CdnStore,
  request: Request,
): Promise<string | undefined> {
  return await (await store.match(request))?.text();
}

type Purge = NonNullable<ConnectedCdn["purgeTags"]>;

async function connectStore(options: CdnContractOptions): Promise<CdnStore> {
  const store = (await options.connect()).store;
  if (store === undefined) throw new Error("expected an origin store");
  return store;
}

// The purge cases read their result back through the store, so they bind both
// from one connection — a second `connect()` would be a second, empty cdn.
async function connectStoredPurge(
  options: CdnContractOptions,
): Promise<{ store: CdnStore; purge: Purge }> {
  const cdn = await options.connect();
  if (cdn.store === undefined || cdn.purgeTags === undefined) {
    throw new Error("expected a store and a tag purge");
  }
  return { store: cdn.store, purge: cdn.purgeTags.bind(cdn) };
}

/** Every case of the cdn contract, for guard tests that run them outside vitest. */
export const cdnContractCases: readonly Case[] = [
  {
    name: "the optional members present are the ones declared",
    run: async (options) => {
      const cdn = await options.connect();
      expect(cdn.store !== undefined).toBe(options.store === true);
      expect(cdn.purgeTags !== undefined).toBe(options.purgeTags === true);
    },
  },
  {
    name: "decorate stamps freshness on a response that declared none",
    run: async (options) => {
      const cdn = await options.connect();
      const plain = new Response("rendered", { status: 200 });
      const decorated = cdn.decorate(plain.clone(), []);
      expect(await decorated.text()).toBe("rendered");
      expect(decorated.status).toBe(200);
      // Whichever header the vendor uses to say "hold this for a while", it was
      // not on the render and has to be on the copy the visitor receives.
      expect(headerPairs(decorated)).not.toEqual(headerPairs(plain));
    },
  },
  {
    name: "decorate carries the tags it is handed",
    run: async (options) => {
      const cdn = await options.connect();
      const decorated = cdn.decorate(new Response("rendered"), [
        "t:post",
        "e:7",
      ]);
      expect(carriesTag(decorated, "t:post")).toBe(true);
      expect(carriesTag(decorated, "e:7")).toBe(true);
    },
  },
  {
    name: "decorate preserves a shared-cacheable freshness the response declared",
    run: async (options) => {
      const cdn = await options.connect();
      const decorated = cdn.decorate(
        new Response("asset", {
          headers: { "cache-control": "public, max-age=31536000, immutable" },
        }),
        [],
      );
      expect(decorated.headers.get("cache-control")).toBe(
        "public, max-age=31536000, immutable",
      );
    },
  },
  {
    name: "decorate returns a private response untouched and untagged",
    run: async (options) => {
      const cdn = await options.connect();
      const personalized = new Response("yours", {
        headers: { "cache-control": "private, no-store" },
      });
      const decorated = cdn.decorate(personalized, ["t:post"]);
      expect(decorated.headers.get("cache-control")).toBe("private, no-store");
      expect(carriesTag(decorated, "t:post")).toBe(false);
    },
  },
  {
    name: "decorate returns a response that sets a cookie untouched and untagged",
    run: async (options) => {
      const cdn = await options.connect();
      // The store strips the cookie from its own copy; this one is the
      // visitor's, so announcing it as shared would hand their cookie to
      // everyone behind the CDN.
      const withCookie = new Response("rendered", {
        headers: { "set-cookie": "plumix_session=secret" },
      });
      const decorated = cdn.decorate(withCookie, ["t:post"]);
      expect(headerPairs(decorated)).toEqual(headerPairs(withCookie));
      expect(carriesTag(decorated, "t:post")).toBe(false);
    },
  },
  {
    name: "match misses a request that was never stored",
    skip: needsStore,
    run: async (options) => {
      const store = await connectStore(options);
      expect(await store.match(pageRequest("/never-stored"))).toBeUndefined();
    },
  },
  {
    name: "a stored response comes back on the next match",
    skip: needsStore,
    run: async (options) => {
      const store = await connectStore(options);
      const request = pageRequest("/post");
      await store.put(request, new Response("rendered", { status: 200 }), []);
      const hit = await store.match(request);
      expect(hit?.status).toBe(200);
      expect(await hit?.text()).toBe("rendered");
    },
  },
  {
    name: "a stored response comes back carrying its tags",
    skip: needsStore,
    run: async (options) => {
      const store = await connectStore(options);
      const request = pageRequest("/tagged-hit");
      // The stored copy is served straight to a visitor on a hit, so a hit and
      // a miss must leave the origin equally cacheable.
      await store.put(request, new Response("rendered"), ["t:post"]);
      const hit = await store.match(request);
      if (hit === undefined) throw new Error("expected a stored response");
      expect(carriesTag(hit, "t:post")).toBe(true);
    },
  },
  {
    name: "a stored response is keyed on its own request",
    skip: needsStore,
    run: async (options) => {
      const store = await connectStore(options);
      await store.put(pageRequest("/a"), new Response("a"), []);
      expect(await store.match(pageRequest("/b"))).toBeUndefined();
    },
  },
  {
    name: "a non-GET request is not stored",
    skip: needsStore,
    run: async (options) => {
      const store = await connectStore(options);
      const path = "/submit";
      await store.put(
        new Request(`${ORIGIN}${path}`, { method: "POST" }),
        new Response("rendered"),
        [],
      );
      // Probed with a GET rather than the POST itself: what a store does with
      // a non-GET `match` is its own business, and asking it here would make
      // the case pass or fail on that instead of on what was written.
      expect(await storedBody(store, pageRequest(path))).toBeUndefined();
    },
  },
  {
    name: "a stored response does not carry the response's Set-Cookie",
    skip: needsStore,
    run: async (options) => {
      const store = await connectStore(options);
      const request = pageRequest("/with-cookie");
      const response = new Response("rendered", {
        headers: { "set-cookie": "plumix_session=secret" },
      });
      await store.put(request, response, []);
      const hit = await store.match(request);
      // `?? null` so declining to store the response at all counts: it is the
      // stricter answer to the same rule, and core's route read-through makes
      // exactly that call before it ever reaches a provider.
      expect(hit?.headers.get("set-cookie") ?? null).toBeNull();
    },
  },
  {
    name: "purging a tag drops every response carrying it",
    skip: needsStoredPurge,
    run: async (options) => {
      const { store, purge } = await connectStoredPurge(options);
      const one = pageRequest("/one");
      const two = pageRequest("/two");
      await store.put(one, new Response("one"), ["t:post", "e:1"]);
      await store.put(two, new Response("two"), ["t:post", "e:2"]);
      await purge(["t:post"]);
      expect(await storedBody(store, one)).toBeUndefined();
      expect(await storedBody(store, two)).toBeUndefined();
    },
  },
  {
    name: "purging a tag leaves responses that do not carry it",
    skip: needsStoredPurge,
    run: async (options) => {
      const { store, purge } = await connectStoredPurge(options);
      const tagged = pageRequest("/tagged");
      const other = pageRequest("/other");
      await store.put(tagged, new Response("tagged"), ["t:post"]);
      await store.put(other, new Response("other"), ["t:page"]);
      await purge(["t:post"]);
      expect(await storedBody(store, tagged)).toBeUndefined();
      expect(await storedBody(store, other)).toBe("other");
    },
  },
  {
    name: "purging a tag nothing carries leaves the cdn alone",
    skip: needsStoredPurge,
    run: async (options) => {
      const { store, purge } = await connectStoredPurge(options);
      const request = pageRequest("/kept");
      await store.put(request, new Response("kept"), ["t:page"]);
      await purge(["t:nothing"]);
      expect(await storedBody(store, request)).toBe("kept");
    },
  },
];

/**
 * Assert an implementation of the `cdn:` slot satisfies its port. Call it at
 * the top level of a test file with a factory that binds a fresh cdn, plus the
 * optional members the provider ships — `decorate` is the only one every
 * provider has, and the cases for the rest run only where they are declared.
 */
export function describeCdnContract(options: CdnContractOptions): void {
  describeContract("cdn contract", cdnContractCases, options);
}
