import { createORPCErrorConstructorMap, ORPCError } from "@orpc/server";
import * as v from "valibot";
import { beforeAll, describe, expect, test } from "vitest";

import type { AuthenticatedUser } from "../context/app.js";
import type { PluginRegistry } from "../plugin/registry.js";
import type { EntryEditRow } from "./editability.js";
import type { EntryViewer } from "./visibility.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { RPC_ERRORS } from "../rpc/errors.js";
import { pooledEntryTypeRegistry } from "../test/pooled-entry-types.js";
import { assertCanEditEntry, canEditEntry } from "./editability.js";

const CALLER: AuthenticatedUser = {
  id: 1,
  email: "caller@example.com",
  role: "contributor",
  meta: {},
};
const STRANGER_ID = 2;

function viewer(
  capabilities: readonly string[],
  user: AuthenticatedUser | null = CALLER,
): EntryViewer {
  return {
    user,
    auth: { can: (capability: string) => capabilities.includes(capability) },
    plugins: createPluginRegistry(),
  };
}

function row(authorId: number | null, type = "post"): EntryEditRow {
  return { type, authorId };
}

const errors = createORPCErrorConstructorMap(RPC_ERRORS);

function denial(ctx: EntryViewer, entry: EntryEditRow): string {
  try {
    assertCanEditEntry(ctx, entry, errors);
  } catch (thrown) {
    if (!(thrown instanceof ORPCError) || thrown.code !== "FORBIDDEN") {
      throw thrown;
    }
    const data: unknown = thrown.data;
    return v.parse(v.object({ capability: v.string() }), data).capability;
  }
  throw new Error("expected a denial");
}

// The rule has three inputs — authorship, `edit_own`, `edit_any` — so the
// table names every combination that changes the answer rather than the arms
// someone remembered to write down.
const CASES = [
  { tier: "nothing", capabilities: [], own: false, any: false },
  {
    tier: "edit_own",
    capabilities: ["entry:post:edit_own"],
    own: true,
    any: false,
  },
  {
    tier: "edit_any",
    capabilities: ["entry:post:edit_any"],
    own: true,
    any: true,
  },
  {
    tier: "both",
    capabilities: ["entry:post:edit_own", "entry:post:edit_any"],
    own: true,
    any: true,
  },
  // `read` alone is the read side's rule, not this one.
  {
    tier: "read only",
    capabilities: ["entry:post:read"],
    own: false,
    any: false,
  },
] as const;

describe("canEditEntry", () => {
  for (const { tier, capabilities, own, any } of CASES) {
    test(`a caller holding ${tier} may edit their own row: ${String(own)}`, () => {
      expect(canEditEntry(viewer(capabilities), row(CALLER.id))).toBe(own);
    });

    test(`a caller holding ${tier} may edit another's row: ${String(any)}`, () => {
      expect(canEditEntry(viewer(capabilities), row(STRANGER_ID))).toBe(any);
    });
  }

  test("an authorless row is nobody's own, so edit_own alone does not reach it", () => {
    expect(canEditEntry(viewer(["entry:post:edit_own"]), row(null))).toBe(
      false,
    );
    expect(canEditEntry(viewer(["entry:post:edit_any"]), row(null))).toBe(true);
  });

  // `route/resolve.ts` asks this on the public request path, where nobody may
  // be signed in.
  test("an anonymous caller owns nothing, even against an authorless row", () => {
    expect(canEditEntry(viewer(["entry:post:edit_own"], null), row(null))).toBe(
      false,
    );
    expect(
      canEditEntry(viewer(["entry:post:edit_own"], null), row(CALLER.id)),
    ).toBe(false);
  });
});

describe("assertCanEditEntry", () => {
  test("returns without throwing for a caller the predicate admits", () => {
    expect(() =>
      assertCanEditEntry(
        viewer(["entry:post:edit_own"]),
        row(CALLER.id),
        errors,
      ),
    ).not.toThrow();
  });

  // Reporting `edit_own` to an author and `edit_any` to a stranger would let a
  // caller learn who wrote a row they cannot see, so both are told `edit_any`.
  test("reports edit_any on every denial, including to the row's own author", () => {
    expect(denial(viewer([]), row(CALLER.id))).toBe("entry:post:edit_any");
    expect(denial(viewer([]), row(STRANGER_ID))).toBe("entry:post:edit_any");
    expect(denial(viewer(["entry:post:read"]), row(CALLER.id))).toBe(
      "entry:post:edit_any",
    );
  });
});

// `news` pools onto `post`, so the rule has to ask the registry rather than
// build `entry:news:*` from the row's own type name.
describe("a type pooled onto another's capabilities", () => {
  let pooled: PluginRegistry;

  beforeAll(async () => {
    pooled = await pooledEntryTypeRegistry();
  });

  function pooledViewer(capabilities: readonly string[]): EntryViewer {
    return { ...viewer(capabilities), plugins: pooled };
  }

  test("a caller holding entry:post:edit_own may edit their own news row", () => {
    expect(
      canEditEntry(
        pooledViewer(["entry:post:edit_own"]),
        row(CALLER.id, "news"),
      ),
    ).toBe(true);
    expect(
      canEditEntry(
        pooledViewer(["entry:post:edit_own"]),
        row(STRANGER_ID, "news"),
      ),
    ).toBe(false);
  });

  test("a capability minted under the pooled type's own name does not reach it", () => {
    expect(
      canEditEntry(
        pooledViewer(["entry:news:edit_any"]),
        row(STRANGER_ID, "news"),
      ),
    ).toBe(false);
  });

  test("denials report the capability under the namespace the type pools onto", () => {
    expect(denial(pooledViewer([]), row(STRANGER_ID, "news"))).toBe(
      "entry:post:edit_any",
    );
  });
});
