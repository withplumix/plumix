// The only file in the workspace that imports plumix via its own
// `exports` map (as an external consumer would). The map points at
// `./dist/test/index.d.ts`, which only exists after a local build.
// Turbo's typecheck deliberately doesn't depend on same-package build,
// so tsc can't resolve the published types at typecheck time — see the
// ambient shim at `plumix-test.shim.d.ts` in this folder which declares
// the subpath as permissive for tsc. Runtime resolution uses the real
// dist; the `test` task (which DOES depend on build) exercises the
// real surface and catches drift from the shim.
//
// The test guards the subpath against breakage — if the barrel in
// @plumix/core/test drifts from what plumix/test re-exports, or a
// future build config drops the test subpath from dist, this fails.
import {
  categoryTerm,
  createDispatcherHarness,
  createRpcHarness,
  createTestDb,
  credentialFactory,
  entryFactory,
  factoriesFor,
  inviteFactory,
  plumixRequest,
  publishedEntry,
  tagTerm,
  termFactory,
  userFactory,
} from "plumix/test";
import { describe, expect, test } from "vitest";

describe("plumix/test subpath", () => {
  test("re-exports the full factory + harness surface", () => {
    for (const exp of [
      userFactory,
      entryFactory,
      publishedEntry,
      termFactory,
      categoryTerm,
      tagTerm,
      inviteFactory,
      credentialFactory,
      factoriesFor,
      createTestDb,
      createDispatcherHarness,
      createRpcHarness,
      plumixRequest,
    ]) {
      expect(exp).toBeDefined();
    }
  });

  test("factoriesFor returns a db-bound factory bundle", async () => {
    const db = await createTestDb();
    const factories = factoriesFor(db);
    expect(factories.user).toBeDefined();
    expect(factories.entry).toBeDefined();
    expect(factories.term).toBeDefined();
    expect(factories.invite).toBeDefined();
    expect(factories.credential).toBeDefined();
  });

  test("term + category + tag factories persist through the db", async () => {
    const db = await createTestDb();
    const factories = factoriesFor(db);
    const category = await factories.category.create();
    expect(category.taxonomy).toBe("category");
    const tag = await factories.tag.create();
    expect(tag.taxonomy).toBe("tag");
  });
});
