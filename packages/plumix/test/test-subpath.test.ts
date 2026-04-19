// Import through the published subpath — fails if the barrel in
// @plumix/core/test drifts from what plumix/test re-exports, or if a
// future build config accidentally drops the test subpath from dist.
import {
  categoryTerm,
  createDispatcherHarness,
  createRpcHarness,
  createTestDb,
  credentialFactory,
  factoriesFor,
  inviteFactory,
  plumixRequest,
  postFactory,
  publishedPost,
  tagTerm,
  termFactory,
  userFactory,
} from "plumix/test";
import { describe, expect, test } from "vitest";

describe("plumix/test subpath", () => {
  test("re-exports the full factory + harness surface", () => {
    for (const exp of [
      userFactory,
      postFactory,
      publishedPost,
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
    expect(factories.post).toBeDefined();
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
