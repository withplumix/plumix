import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe.js";
import { AUTHED_ADMIN, mockSession, rpcOkBody } from "./support/rpc-mock.js";

const UNSETTLED = {
  keys: [
    {
      store: "entry",
      scope: "post",
      key: "sealed",
      settleable: 3,
      unconvertible: 0,
      unconvertibleIds: [],
    },
    {
      store: "user",
      scope: null,
      key: "newsletter",
      settleable: 0,
      unconvertible: 1,
      unconvertibleIds: [7],
    },
  ],
  settled: 0,
  next: null,
};

const CLEAN = { keys: [], settled: 0, next: null };

// `meta.sweep` answers a report or a settle depending on the `write` it is
// sent, so the mock reads the request rather than answering by path alone.
async function mockSweep(
  page: Page,
  answer: (write: boolean, cursor: unknown) => unknown,
): Promise<boolean[]> {
  const writes: boolean[] = [];
  await page.route("**/_plumix/rpc/**", (route) => {
    const request = route.request();
    if (request.url().endsWith("/auth/session")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(AUTHED_ADMIN),
      });
    }
    if (request.url().endsWith("/meta/sweep")) {
      const { json } = request.postDataJSON() as {
        json: { write: boolean; cursor?: unknown };
      };
      writes.push(json.write);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(answer(json.write, json.cursor ?? null)),
      });
    }
    return route.fulfill({ status: 404, body: "not-mocked" });
  });
  return writes;
}

test.describe("/field-values", () => {
  test("reports unconverted values per store and field", async ({ page }) => {
    await mockSweep(page, () => UNSETTLED);
    await page.goto("field-values");

    await expect(page.getByTestId("field-values-heading")).toBeVisible();
    await expect(
      page.getByTestId("field-values-row-entry-sealed"),
    ).toBeVisible();
    await expect(
      page.getByTestId("field-values-row-user-newsletter"),
    ).toBeVisible();
    await expect(page.getByTestId("field-values-settle")).toBeVisible();
    await expect(page.getByTestId("field-values-link-user-7")).toHaveAttribute(
      "href",
      /\/users\/7\/edit$/,
    );
    await expectNoAxeViolations(page);
  });

  test("converting asks for a write, then re-reads the report", async ({
    page,
  }) => {
    let settled = false;
    const writes = await mockSweep(page, (write) => {
      if (write) {
        settled = true;
        return { keys: [], settled: 3, next: null };
      }
      return settled ? CLEAN : UNSETTLED;
    });
    await page.goto("field-values");

    await page.getByTestId("field-values-settle").click();

    await expect(page.getByTestId("field-values-settled")).toContainText("3");
    await expect(page.getByTestId("field-values-clean")).toBeVisible();
    expect(writes).toEqual([false, true, false]);
  });

  // Each call stops at the server's query budget, so the page follows the
  // cursor it hands back until the whole site has been walked.
  test("follows the cursor across calls, for the report and the settle", async ({
    page,
  }) => {
    let settled = false;
    const cursor = { store: "entry", after: 500 };
    const writes = await mockSweep(page, (write, from) => {
      const first = from === null;
      if (write) {
        settled = true;
        return {
          keys: [],
          settled: first ? 2 : 1,
          next: first ? cursor : null,
        };
      }
      if (settled) return CLEAN;
      return first ? { ...UNSETTLED, next: cursor } : UNSETTLED;
    });
    await page.goto("field-values");

    // Two report calls, one count each: 3 + 3.
    await expect(
      page.getByTestId("field-values-row-entry-sealed"),
    ).toContainText("6");

    await page.getByTestId("field-values-settle").click();

    await expect(page.getByTestId("field-values-settled")).toContainText("3");
    expect(writes.filter(Boolean)).toHaveLength(2);
  });

  test("a clean site says so and offers nothing to convert", async ({
    page,
  }) => {
    await mockSweep(page, () => CLEAN);
    await page.goto("field-values");

    await expect(page.getByTestId("field-values-clean")).toBeVisible();
    await expect(page.getByTestId("field-values-settle")).toHaveCount(0);
  });

  // A failed report is not a clean site: saying "nothing to convert" when the
  // check never ran would send an operator away with the problem intact.
  test("a report that fails says so rather than reporting a clean site", async ({
    page,
  }) => {
    await page.route("**/_plumix/rpc/**", (route) => {
      if (route.request().url().endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(AUTHED_ADMIN),
        });
      }
      return route.fulfill({ status: 500, body: "boom" });
    });
    await page.goto("field-values");

    await expect(page.getByTestId("field-values-report-error")).toBeVisible();
    await expect(page.getByTestId("field-values-clean")).toHaveCount(0);
  });

  test("a user without settings:manage is sent home", async ({ page }) => {
    const admin = AUTHED_ADMIN.user;
    if (!admin) throw new Error("AUTHED_ADMIN fixture missing user");
    await mockSession(page, {
      user: {
        ...admin,
        role: "editor",
        capabilities: ["entry:post:edit_own"],
      },
      needsBootstrap: false,
    });
    await page.goto("field-values");

    await expect(page).toHaveURL(/\/(?:$|_plumix\/admin\/$)/);
  });
});
