import { expectTypeOf, test } from "vitest";

import type { RoleGrants, RoleNameOf } from "../access/contract/roles.js";
import type { RuntimeAdapter } from "../context/runtime-adapter.js";
import type { DatabaseAdapter } from "./contract/slots.js";
import { auth } from "../auth/config.js";
import { plumix } from "./define-config.js";

const runtime: RuntimeAdapter = {
  name: "mock",
  handler: {},
  generateEntry: () => "",
};
const database: DatabaseAdapter = {
  kind: "mock",
  connect: () => ({ db: {} }),
};
const passkey = {
  rpName: "Test",
  rpId: "example.com",
  origin: "https://example.com",
} as const;

const designer = {
  label: "Designer",
  extends: "author",
  can: { admin: ["access"], entry: { page: ["read", "edit_any"] } },
} as const;

test("a role groups its capabilities by what they guard", () => {
  plumix({
    runtime,
    database,
    auth: auth({ passkey }),
    roles: {
      designer: {
        label: "Designer",
        extends: "author",
        can: {
          admin: ["access"],
          entry: { page: ["read", "edit_any"], product: ["read"] },
          term: { category: ["assign"] },
          comment: ["moderate"],
        },
      },
      editor: { can: { user: ["list"], settings: ["manage"] } },
    },
  });
});

test("a misspelled action fails to compile", () => {
  const grants = (can: RoleGrants) => can;
  // @ts-expect-error `publsh` is not an entry action.
  grants({ entry: { page: ["publsh"] } });
  // @ts-expect-error `remove` is not a term action.
  grants({ term: { category: ["remove"] } });
  // @ts-expect-error `acess` is not in the core `admin` group.
  grants({ admin: ["acess"] });
  // @ts-expect-error `fly` is not in the core `user` group.
  grants({ user: ["fly"] });
});

test("entry types and taxonomies autocomplete the known names and accept any other", () => {
  type EntryKeys = keyof NonNullable<RoleGrants["entry"]>;
  type TermKeys = keyof NonNullable<RoleGrants["term"]>;
  expectTypeOf<"post" | "page">().toExtend<EntryKeys>();
  expectTypeOf<"category" | "tag">().toExtend<TermKeys>();
  expectTypeOf<"product">().toExtend<EntryKeys>();
});

test("admin can't be declared", () => {
  plumix({
    runtime,
    database,
    auth: auth({ passkey }),
    // @ts-expect-error admin always holds every capability.
    roles: { admin: { can: { user: ["list"] } } },
  });
});

test("a role extends only a default role or one the config declares", () => {
  plumix({
    runtime,
    database,
    auth: auth({ passkey }),
    roles: {
      designer,
      // @ts-expect-error `ghost` is not a role.
      reviewer: { extends: "ghost", can: {} },
    },
  });
});

test("self-signup and allowed domains name a default role or a declared one", () => {
  plumix({
    runtime,
    database,
    auth: auth({
      passkey,
      selfSignup: { defaultRole: "designer" },
      allowedDomains: { "example.com": "editor" },
    }),
    roles: { designer },
  });
  plumix({
    runtime,
    database,
    // @ts-expect-error `ghost` is not a role.
    auth: auth({ passkey, selfSignup: { defaultRole: "ghost" } }),
    roles: { designer },
  });
  plumix({
    runtime,
    database,
    // @ts-expect-error `ghost` is not a role.
    auth: auth({ passkey, allowedDomains: { "example.com": "ghost" } }),
    roles: { designer },
  });
});

test("an invite's role names a default role or a declared one", () => {
  const _config = plumix({
    runtime,
    database,
    auth: auth({ passkey }),
    roles: { designer },
  });
  expectTypeOf<RoleNameOf<typeof _config>>().toEqualTypeOf<
    "subscriber" | "contributor" | "author" | "editor" | "admin" | "designer"
  >();
});
