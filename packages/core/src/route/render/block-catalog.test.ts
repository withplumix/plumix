import { describe, expect, test } from "vitest";

import { createBlockCatalogs } from "./block-catalog.js";

describe("createBlockCatalogs", () => {
  test("reads an enabled regional locale from its catalog locale", async () => {
    const blockCatalogs = createBlockCatalogs(
      {},
      { "de-AT": "de" },
      {
        de: () =>
          Promise.resolve({ messages: { "core.block.title": "Titel" } }),
      },
    );
    expect(await blockCatalogs("de-AT")).toEqual({
      "core.block.title": "Titel",
    });
  });
});
