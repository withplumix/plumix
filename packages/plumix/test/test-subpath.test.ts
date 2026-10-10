// The only file importing plumix through its own `exports` map; tsc resolves
// it via the ambient shim, so the build-dependent `test` task catches drift.
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
import {
  describeAssetsContract,
  describeCdnContract,
  describeDatabaseContract,
  describeKvContract,
  describeObjectStorageContract,
} from "plumix/test/conformance";
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

describe("plumix/test/conformance subpath", () => {
  // Every other caller reaches the suites through the source resolver, so this
  // is the only place the published subpath is exercised.
  test("re-exports one describe per slot port", () => {
    for (const suite of [
      describeKvContract,
      describeObjectStorageContract,
      describeCdnContract,
      describeDatabaseContract,
      describeAssetsContract,
    ]) {
      expect(suite).toBeTypeOf("function");
    }
  });
});
