import { expect, test } from "vitest";

import * as index from "./index.js";

// Value exports only: a type-only export is erased at runtime and so is
// deliberately not pinned here.

test("the barrel publishes only what has a consumer outside this package", () => {
  expect(
    Object.keys(index).sort(),
    "Adding a name here is a decision to publish it. `IMAGE_ROUTE`, `createScheduler` and `NodeImageDelivery` were removed because nothing outside this package reached them.",
  ).toEqual([
    "createAssetsLayer",
    "createImageLayer",
    "createNodeSite",
    "createRequestListener",
    "diskStorage",
    "images",
    "node",
    "nodeSqlite",
    "startScheduledRunner",
  ]);
});
