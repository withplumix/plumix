import { describe, expect, test } from "vitest";

import type { RuntimeSync, SyncEnd } from "../../context/runtime-adapter.js";
import type { HookRegistry } from "../../hooks/registry.js";
import type { SyncContractEnds } from "./sync.js";
import { memorySyncEnds } from "../sync/memory-ends.js";
import { failingCases } from "./case.js";
import { syncContractCases } from "./sync.js";

/** The reference ends, each opened end passed through `alter`. */
function brokenBy(
  alter: (end: SyncEnd) => SyncEnd,
): (hooks: HookRegistry) => Promise<SyncContractEnds> {
  return async (hooks) => {
    const ends = await memorySyncEnds({ hooks });
    const sync: RuntimeSync = {
      open: async (options) => alter(await ends.sync.open(options)),
    };
    return { ...ends, sync };
  };
}

describe("sync contract cases", () => {
  test("fail a transport whose dry run writes", async () => {
    const failed = await failingCases(syncContractCases, {
      open: brokenBy((end) => ({
        ...end,
        importData: (from, scopes) =>
          end.importData(from, scopes, { dryRun: false }),
      })),
    });

    expect(failed).toContain(
      "a dry run writes nothing and reports what the real import then does",
    );
  });

  test("fail a transport that imports a dump at other heads", async () => {
    const failed = await failingCases(syncContractCases, {
      open: brokenBy((end) => ({
        ...end,
        // Hands its own heads in as the dump's, which skips the check.
        importData: async (from, scopes, options) =>
          end.importData(
            {
              manifest: { ...from.manifest, heads: await end.heads() },
              rows: (table) => from.rows(table),
              authors: () => from.authors(),
              objects: () => from.objects(),
            },
            scopes,
            options,
          ),
      })),
    });

    expect(failed).toContain(
      "an import whose dump is at other heads fails before any write",
    );
  });

  test("fail a transport that leaves objects the source lacks", async () => {
    const failed = await failingCases(syncContractCases, {
      open: brokenBy((end) => ({
        ...end,
        importData: async (from, scopes, options) => {
          const report = await end.importData(
            from,
            scopes.filter((scope) => scope.name !== "media"),
            options,
          );
          return report;
        },
      })),
    });

    expect(failed).toContain(
      "a media replace leaves the target holding exactly the source's objects",
    );
  });

  test("fail a transport whose settle throws for a failed listener", async () => {
    const failed = await failingCases(syncContractCases, {
      open: brokenBy((end) => ({
        ...end,
        settle: async (event) => {
          const report = await end.settle(event);
          if (report.failures.length > 0) throw new Error("settle failed");
          return report;
        },
      })),
    });

    expect(failed).toContain(
      "settle reports a failed listener as a step and still resolves",
    );
  });
});
