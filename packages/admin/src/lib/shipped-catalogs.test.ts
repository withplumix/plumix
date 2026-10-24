import { expect, test } from "vitest";

import { shippedLocales } from "./shipped-catalogs.js";

const ADMIN = "/repo/packages/admin/locales/";
const BLOCKS = "/repo/packages/core/locales/blocks-";

test("lists the locales whose catalogs sit under a prefix, sorted", () => {
  expect(
    shippedLocales(
      [
        `${ADMIN}zh-CN.mjs`,
        `${ADMIN}de.mjs`,
        `${ADMIN}en.mjs`,
        "/repo/packages/admin/src/main.tsx",
      ],
      ADMIN,
    ),
  ).toEqual(["de", "en", "zh-CN"]);
});

test("reads a prefix that ends mid-name, as the blocks catalogs do", () => {
  expect(
    shippedLocales(
      [
        `${BLOCKS}en.mjs`,
        `${BLOCKS}zh-CN.mjs`,
        "/repo/packages/core/locales/admin-areas-de.mjs",
      ],
      BLOCKS,
    ),
  ).toEqual(["en", "zh-CN"]);
});

test("skips a file in a nested folder and one that is not a compiled catalog", () => {
  expect(
    shippedLocales(
      [`${ADMIN}en.mjs`, `${ADMIN}old/de.mjs`, `${ADMIN}de.po`],
      ADMIN,
    ),
  ).toEqual(["en"]);
});
