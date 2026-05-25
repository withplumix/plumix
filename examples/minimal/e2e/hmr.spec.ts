// Verifies that editing a `"use client"` component file in dev mode
// propagates on the next request. Vite's HMR machinery rebuilds the
// served module; a full page reload re-fetches the SSR'd HTML + the
// updated chunk. Live in-place HMR for hydrated islands is out of scope
// (Astro / Next have the same constraint without RSC plumbing) — this
// test just verifies "edits propagate on reload."

import { readFile, writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

const COUNTER_PATH = "src/counter.tsx";

test("editing the island source propagates to the next page load", async ({
  page,
}) => {
  const original = await readFile(COUNTER_PATH, "utf8");
  try {
    // Baseline render.
    await page.goto("/");
    await expect(page.getByTestId("counter-header")).toHaveText("header: 0");

    // Patch the source — change the label format.
    await writeFile(
      COUNTER_PATH,
      original.replace(
        "${props.label}: ${String(count)}",
        "${props.label} count is ${String(count)}",
      ),
    );

    // Give Vite a beat to invalidate, then reload.
    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.getByTestId("counter-header")).toHaveText(
      "header count is 0",
    );

    // Hydration still works after the edit.
    await page.getByTestId("counter-header").click();
    await expect(page.getByTestId("counter-header")).toHaveText(
      "header count is 1",
    );
  } finally {
    await writeFile(COUNTER_PATH, original);
  }
});
