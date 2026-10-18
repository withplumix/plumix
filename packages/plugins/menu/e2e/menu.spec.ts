import { resolve } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { eq } from "plumix/db";
import { entries, terms } from "plumix/schema";
import { factoriesFor } from "plumix/test";
import { dragTo, expect, openPlaygroundDb, test } from "plumix/test/playwright";

import { INDENTATION_WIDTH } from "../src/admin/tree-state.js";

/**
 * Read rather than hard-coded: the slug is the server's to choose, and this
 * suite's shape assertion is the only guard on `slugify`.
 */
let menuSlug = "";

// Tests share state across the serial sequence: the menu created in
// the first test is reused for locations assignment + drag-nest + the
// max-depth ceiling check.
test.describe.serial("@plumix/plugin-menu — worker-driven happy path", () => {
  test("create menu → add items → reorder → save → reload persists", async ({
    page,
  }) => {
    // 1. Open the menus admin page. The admin shell is loaded over a
    //    real session cookie (storageState) so the menus route renders
    //    without bouncing to /login.
    await page.goto("pages/menus");
    await expect(page.getByTestId("menus-shell")).toBeVisible();

    // 2. Create a menu. The "create new" sentinel opens a dialog; name the
    //    menu and submit.
    await page.getByTestId("menus-selector-create-new").click();
    await page.getByTestId("menus-create-name").fill("Primary");
    await page.getByTestId("menus-create-submit").click();
    await expect(page.getByTestId("menu-item-editor")).toBeVisible();
    // `?menu=<slug>` is the only place the worker-assigned slug surfaces
    // client-side.
    menuSlug = new URL(page.url()).searchParams.get("menu") ?? "";
    expect(menuSlug).toMatch(/^primary(-\d+)?$/);
    await expect(menuOption(page)).toBeVisible();

    // 3. Add two custom items via the picker's Custom tab.
    await page.getByTestId("menu-picker-tab-custom").click();
    await expect(page.getByTestId("menu-picker-custom-panel")).toBeVisible();

    await page.getByTestId("menu-picker-custom-url").fill("/");
    await page.getByTestId("menu-picker-custom-label").fill("Home");
    await page.getByTestId("menu-picker-custom-add").click();

    await page.getByTestId("menu-picker-custom-url").fill("/docs");
    await page.getByTestId("menu-picker-custom-label").fill("Docs");
    await page.getByTestId("menu-picker-custom-add").click();

    const rowLocators = page
      .getByTestId("menu-tree")
      .locator("[data-testid^='menu-item-row-']");
    await expect(rowLocators).toHaveCount(2);

    // Capture the second row's id so we can focus its drag handle for
    // the keyboard reorder below; ids are server-assigned, so we
    // can't pre-compute them.
    const secondTestid = await rowLocators.nth(1).getAttribute("data-testid");
    if (!secondTestid) throw new Error("second row missing data-testid");
    const secondId = secondTestid.replace("menu-item-row-", "");

    // KeyboardSensor calls preventDefault on Space, suppressing the
    // activator's native click.
    const dragHandle = page.getByTestId(`menu-item-drag-${secondId}`);
    await dragHandle.focus();
    await page.keyboard.press("Space");
    // `useSortable` puts `aria-pressed` on the activator for the life of
    // the drag, so this is the pickup landing.
    await expect(dragHandle).toHaveAttribute("aria-pressed", "true");
    // A keypress can be silently ignored (KeyboardSensor attaches its
    // listener from a `setTimeout`; missing rects bail), so re-send until the
    // tree shifts. Extra ArrowUps at the top move nothing.
    const shiftedDown = /^matrix\(1, 0, 0, 1, 0, [1-9]/;
    await expect(async () => {
      await page.keyboard.press("ArrowUp");
      await expect(rowLocators.first()).toHaveCSS("transform", shiftedDown, {
        timeout: 500,
      });
    }).toPass({ timeout: 10_000 });
    await page.keyboard.press("Space");

    // After reorder, the originally-second row (Docs) is now first.
    await expect(rowLocators.first()).toContainText("Docs");
    await expect(rowLocators.last()).toContainText("Home");

    // 5. Save. Wait for the network round-trip so reload reads
    //    committed state.
    const saved = page.waitForResponse(
      (r) => r.url().endsWith("/menu/save") && r.status() === 200,
    );
    await page.getByTestId("menu-save-button").click();
    await saved;

    // 6. Reload and re-open the editor. The reordered state persists.
    await page.reload();
    await expect(page.getByTestId("menus-shell")).toBeVisible();
    await menuOption(page).click();
    await expect(page.getByTestId("menu-item-editor")).toBeVisible();

    const reloadedRows = page
      .getByTestId("menu-tree")
      .locator("[data-testid^='menu-item-row-']");
    await expect(reloadedRows).toHaveCount(2);
    await expect(reloadedRows.first()).toContainText("Docs");
    await expect(reloadedRows.last()).toContainText("Home");
  });

  test("locations tab — assign the menu to Primary Nav, reload, assignment persists", async ({
    page,
  }) => {
    await page.goto("pages/menus");
    await expect(page.getByTestId("menus-shell")).toBeVisible();

    // Switch to the Locations tab. The menu plugin's default
    // playground config registers "primary" as a location.
    await page.getByTestId("menus-tab-locations").click();
    await expect(page.getByTestId("menus-tab-locations-panel")).toBeVisible();

    // Assign the menu created above to the "primary" location. The
    // select's value matches the menu's slug.
    const saved = page.waitForResponse(
      (r) => r.url().endsWith("/menu/assignLocation") && r.status() === 200,
    );
    await page.getByTestId("menus-location-select-primary").click();
    await page.getByTestId(`menus-location-select-primary-${menuSlug}`).click();
    await saved;

    // Reload and re-enter the locations tab — assignment persists. The Radix
    // trigger shows the assigned menu's name ("Primary"), not its slug.
    await page.reload();
    await expect(page.getByTestId("menus-shell")).toBeVisible();
    await page.getByTestId("menus-tab-locations").click();
    await expect(
      page.getByTestId("menus-location-select-primary"),
    ).toContainText("Primary");
  });

  test("drag-nest: pointer drag puts Docs under Home and persists across reload", async ({
    page,
  }) => {
    // Open the Primary menu's items editor (created in the first
    // test). We expect 2 rows: Docs (depth 0) then Home (depth 0)
    // (the order the first test left after save).
    await page.goto("pages/menus");
    await menuOption(page).click();
    await expect(page.getByTestId("menu-item-editor")).toBeVisible();

    const rows = page
      .getByTestId("menu-tree")
      .locator("[data-testid^='menu-item-row-']");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toHaveAttribute("data-depth", "0");
    await expect(rows.last()).toHaveAttribute("data-depth", "0");

    // Drop the second row (Home) onto itself with a one-indent
    // horizontal offset. The projection sees previous=Docs (depth 0)
    // and bumps Home to depth 1 (child of Docs).
    const homeTestid = await rows.nth(1).getAttribute("data-testid");
    if (!homeTestid) throw new Error("home row missing data-testid");
    const homeId = homeTestid.replace("menu-item-row-", "");
    await dragRowOnSelf(page, homeId, { nestPx: INDENTATION_WIDTH });
    await expect(page.getByTestId(`menu-item-row-${homeId}`)).toHaveAttribute(
      "data-depth",
      "1",
    );

    // Save round-trips through the worker, then reload + reopen and
    // confirm Home is still at depth 1.
    const saved = page.waitForResponse(
      (r) => r.url().endsWith("/menu/save") && r.status() === 200,
    );
    await page.getByTestId("menu-save-button").click();
    await saved;

    await page.reload();
    await menuOption(page).click();
    await expect(page.getByTestId("menu-item-editor")).toBeVisible();

    const reloadedHome = page
      .getByTestId("menu-tree")
      .locator("[data-testid^='menu-item-row-']")
      .filter({ hasText: "Home" });
    await expect(reloadedHome).toHaveAttribute("data-depth", "1");
  });

  test("the Primary Nav location's maxDepth of 2 limits the editor and the rendered nav", async ({
    page,
  }) => {
    // Docs holds Home from the drag-nest test. Deep sits a third level down,
    // as a lowered limit leaves an item behind: stored straight into the
    // database.
    const db = await openPlaygroundDb({
      cwd: resolve(process.cwd(), "playground"),
    });
    const factories = factoriesFor(db);
    const [home] = await db
      .select({ id: entries.id, authorId: entries.authorId })
      .from(entries)
      .where(eq(entries.title, "Home"));
    const [menuTerm] = await db
      .select({ id: terms.id })
      .from(terms)
      .where(eq(terms.slug, menuSlug));
    if (!home || !menuTerm) throw new Error("Primary menu rows missing");
    const deep = await factories.entry.create({
      type: "menu_item",
      title: "Deep",
      slug: "mi-primary-deep",
      status: "published",
      authorId: home.authorId,
      parentId: home.id,
      meta: { kind: "custom", url: "/deep" },
    });
    await factories.entryTerm.create({
      entryId: deep.id,
      termId: menuTerm.id,
    });

    await page.goto("pages/menus");
    await menuOption(page).click();
    await expect(page.getByTestId("menu-item-editor")).toBeVisible();
    await expect(page.getByTestId("menu-settings-depth-limit")).toHaveText(
      "Up to 2 levels, set by the Primary Nav location",
    );
    await expect(
      page.getByTestId(`menu-item-hidden-${String(deep.id)}`),
    ).toHaveText("Hidden in Primary Nav");

    // Blog goes in at the root, then a two-indent drag aims it at a third level.
    await page.getByTestId("menu-picker-tab-custom").click();
    await page.getByTestId("menu-picker-custom-url").fill("/blog");
    await page.getByTestId("menu-picker-custom-label").fill("Blog");
    await page.getByTestId("menu-picker-custom-add").click();
    const rows = page
      .getByTestId("menu-tree")
      .locator("[data-testid^='menu-item-row-']");
    await expect(rows).toHaveCount(4);
    const blogRow = rows.filter({ hasText: "Blog" });
    await expect(blogRow).toHaveAttribute("data-depth", "0");
    const blogTestid = await blogRow.getAttribute("data-testid");
    if (!blogTestid) throw new Error("blog row missing data-testid");
    const blogId = blogTestid.replace("menu-item-row-", "");

    await dragRowOnSelf(page, blogId, { nestPx: 2 * INDENTATION_WIDTH });

    // Refused the third level: Blog stops at the second, beside Home.
    await expect(page.getByTestId(`menu-item-row-${blogId}`)).toHaveAttribute(
      "data-depth",
      "1",
    );
    // Deep stays where it is and doesn't block the save.
    const saved = page.waitForResponse(
      (r) => r.url().endsWith("/menu/save") && r.status() === 200,
    );
    await page.getByTestId("menu-save-button").click();
    await saved;

    await page.goto("/");
    const nav = page.getByTestId("primary-nav");
    await expect(nav.getByTestId("nav-level-0")).toHaveText(/^Docs/);
    await expect(nav.getByTestId("nav-level-1")).toHaveCount(2);
    await expect(nav.getByTestId("nav-level-2")).toHaveCount(0);
  });
});

// The entry item is seeded straight into the playground's database, so it
// starts without a snapshot. The admin's save is what writes one.
test("a trashed entry's item keeps its label, and Convert to Custom URL fills in its last URL", async ({
  page,
}) => {
  const db = await openPlaygroundDb({
    cwd: resolve(process.cwd(), "playground"),
  });
  const factories = factoriesFor(db);
  const author = await factories.admin.create({
    email: "author@example.test",
    slug: "author",
  });
  const post = await factories.entry.create({
    type: "post",
    title: "About us",
    slug: "about-us",
    status: "published",
    authorId: author.id,
  });
  const linked = await factories.term.create({
    taxonomy: "menu",
    slug: "linked",
    name: "Linked",
  });
  const item = await factories.entry.create({
    type: "menu_item",
    title: "",
    slug: "mi-linked-about-us",
    status: "published",
    authorId: author.id,
    meta: { kind: "entry", entryId: post.id },
  });
  await factories.entryTerm.create({ entryId: item.id, termId: linked.id });

  await page.goto("pages/menus");
  await page.getByTestId("menus-selector-option-linked").click();
  const row = page.getByTestId(`menu-item-row-${String(item.id)}`);
  await expect(row).toHaveAttribute("data-state", "ok");
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/menu/save") && r.status() === 200,
  );
  await page.getByTestId("menu-save-button").click();
  await saved;

  await db
    .update(entries)
    .set({ status: "trash" })
    .where(eq(entries.id, post.id));
  await page.reload();
  await page.getByTestId("menus-selector-option-linked").click();
  await expect(row).toHaveAttribute("data-state", "broken");
  await expect(row).toContainText("About us");

  // The editor has no URL field, so the URL Convert to Custom URL filled
  // in is read off the save that carries it.
  await page.getByTestId(`menu-item-convert-${String(item.id)}`).click();
  const converted = page.waitForRequest((r) => r.url().endsWith("/menu/save"));
  await page.getByTestId("menu-save-button").click();
  expect((await converted).postData()).toContain('"url":"/post/about-us"');
});

test("entry and term tabs add linked items picked from the keyboard, and an override survives a reload", async ({
  page,
}) => {
  const db = await openPlaygroundDb({
    cwd: resolve(process.cwd(), "playground"),
  });
  const factories = factoriesFor(db);
  const author = await factories.admin.create({
    email: "picker-author@example.test",
    slug: "picker-author",
  });
  await factories.entry.create({
    type: "post",
    title: "Pricing plans",
    slug: "pricing-plans",
    status: "published",
    authorId: author.id,
  });
  await factories.term.create({
    taxonomy: "category",
    slug: "guides",
    name: "Guides",
  });
  await factories.term.create({
    taxonomy: "menu",
    slug: "picked",
    name: "Picked",
  });

  await page.goto("pages/menus");
  await page.getByTestId("menus-selector-option-picked").click();
  await expect(page.getByTestId("menu-item-editor")).toBeVisible();

  // Posts is the first tab, so it is open on load.
  await pickFromLinkedTab(page, "Pricing", "Pricing plans");
  await page.getByTestId("menu-picker-tab-term-category").click();
  await pickFromLinkedTab(page, "Guid", "Guides");

  const rows = page
    .getByTestId("menu-tree")
    .locator("[data-testid^='menu-item-row-']");
  await expect(rows).toHaveCount(2);
  await rows.filter({ hasText: "Pricing plans" }).click();
  const title = page.getByTestId("menu-item-detail-title");
  await expect(title).toHaveAttribute("placeholder", "Pricing plans");
  await title.fill("Plans");

  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/menu/save") && r.status() === 200,
  );
  await page.getByTestId("menu-save-button").click();
  await saved;

  await page.reload();
  await page.getByTestId("menus-selector-option-picked").click();
  const reloaded = page
    .getByTestId("menu-tree")
    .locator("[data-testid^='menu-item-row-']");
  await expect(reloaded).toHaveCount(2);
  await expect(reloaded.first()).toContainText("Plans");
  await expect(reloaded.first()).toHaveAttribute("data-state", "ok");
  await expect(reloaded.last()).toContainText("Guides");
  await expect(reloaded.last()).toHaveAttribute("data-state", "ok");
});

test("deleting a menu asks first, and it is gone after a reload", async ({
  page,
}) => {
  const db = await openPlaygroundDb({
    cwd: resolve(process.cwd(), "playground"),
  });
  await factoriesFor(db).term.create({
    taxonomy: "menu",
    slug: "doomed",
    name: "Doomed",
  });

  await page.goto("pages/menus");
  await page.getByTestId("menus-selector-option-doomed").click();
  await expect(page.getByTestId("menu-item-editor")).toBeVisible();

  await page.getByTestId("menu-delete-button").click();
  await expect(page.getByTestId("menu-delete-dialog")).toBeVisible();
  const deleted = page.waitForResponse(
    (r) => r.url().endsWith("/menu/delete") && r.status() === 200,
  );
  await page.getByTestId("menu-delete-confirm").click();
  await deleted;

  await page.reload();
  await expect(page.getByTestId("menus-shell")).toBeVisible();
  await expect(page.getByTestId("menus-selector-option-doomed")).toHaveCount(0);
});

test("adding the same result twice announces each add", async ({ page }) => {
  const db = await openPlaygroundDb({
    cwd: resolve(process.cwd(), "playground"),
  });
  const factories = factoriesFor(db);
  const author = await factories.admin.create({
    email: "announce-author@example.test",
    slug: "announce-author",
  });
  await factories.entry.create({
    type: "post",
    title: "Team page",
    slug: "team-page",
    status: "published",
    authorId: author.id,
  });
  await factories.term.create({
    taxonomy: "menu",
    slug: "announced",
    name: "Announced",
  });

  await page.goto("pages/menus");
  await page.getByTestId("menus-selector-option-announced").click();
  await page.getByTestId("menu-picker-search-input").fill("Team");
  const option = page
    .getByTestId("menu-picker-linked-panel")
    .locator("[data-testid^='menu-picker-option-']");
  await expect(option).toHaveCount(1);

  // A screen reader speaks a live region when its content is replaced, so an
  // add has to put new text in the region even when it repeats.
  const region = page.getByTestId("menu-picker-announcement");
  await expect(region).toHaveAttribute("aria-live", "polite");
  const announced = await region.evaluateHandle((node) => {
    const seen: (string | null)[] = [];
    new MutationObserver((records) => {
      seen.push(
        ...records.flatMap((record) =>
          Array.from(record.addedNodes, (added) => added.textContent),
        ),
      );
    }).observe(node, { childList: true, subtree: true });
    return seen;
  });

  await option.click();
  await option.click();

  await expect
    .poll(() => announced.evaluate((seen) => [...seen]))
    .toEqual(["Added Team page to the menu", "Added Team page to the menu"]);
});

/**
 * Types into the open tab's search, waits for the only match, then picks it
 * with the keyboard alone.
 */
async function pickFromLinkedTab(
  page: Page,
  query: string,
  label: string,
): Promise<void> {
  const search = page.getByTestId("menu-picker-search-input");
  await search.fill(query);
  const options = page
    .getByTestId("menu-picker-linked-panel")
    .locator("[data-testid^='menu-picker-option-']");
  await expect(options).toHaveCount(1);
  await expect(options).toContainText(label);
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(page.getByTestId("menu-tree")).toContainText(label);
}

function menuOption(page: Page): Locator {
  return page.getByTestId(`menus-selector-option-${menuSlug}`);
}

/** Returns after the drop, since `data-depth` is projected mid-drag. */
async function dragRowOnSelf(
  page: Page,
  rowId: string,
  options: { readonly nestPx?: number } = {},
): Promise<void> {
  const handle = page.getByTestId(`menu-item-drag-${rowId}`);
  const target = page.getByTestId(`menu-item-row-${rowId}`);
  await dragTo(page, handle, target, {
    targetPosition: (box) => ({
      x: box.width / 2 + (options.nestPx ?? 0),
      y: box.height / 2,
    }),
    steps: 12,
    // Before the drop clears it, this separates a drag the sensor accepted
    // from a burst of events it ignored.
    beforeDrop: () => expect(handle).toHaveAttribute("aria-pressed", "true"),
  });
  // `none` is the DragEnd commit; a self-drop still carries a transform
  // mid-drag. `aria-pressed` can't do this: it is absent before and after.
  await expect(target).toHaveCSS("transform", "none");
  await waitForClicksToLand(page);
}

/**
 * dnd-kit swallows clicks until a 50ms timer that runs late under load, so
 * poll a probe click. Radix layers see it: never call with a dialog open.
 */
async function waitForClicksToLand(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          let landed = false;
          const seen = (): void => {
            landed = true;
          };
          document.addEventListener("click", seen);
          document.body.dispatchEvent(
            new MouseEvent("click", { bubbles: true }),
          );
          document.removeEventListener("click", seen);
          return landed;
        }),
      { message: "dnd-kit's click swallower is still armed", timeout: 2_000 },
    )
    .toBe(true);
}

// Guards against the menus page shipping as bare unstyled HTML.
test("admin page ships styled controls", async ({ page }) => {
  await page.goto("pages/menus");
  await expect(page.getByTestId("menus-shell")).toBeVisible();

  const ui = await styledControls(page, "menus-shell");
  expect(ui.total).toBeGreaterThan(0);
  expect(ui.styled).toBeGreaterThan(0);
});

/**
 * Counts the plugin shell's interactive controls and how many carry a
 * styling class — a count of 0 is the unstyled-component regression signal.
 */
async function styledControls(page: Page, shellTestId: string) {
  return page.evaluate((id) => {
    const shell = document.querySelector(`[data-testid="${id}"]`);
    const controls = shell
      ? Array.from(shell.querySelectorAll("button, a, input, select, label"))
      : [];
    return {
      total: controls.length,
      styled: controls.filter(
        (el) => (el.getAttribute("class") ?? "").trim().length > 0,
      ).length,
    };
  }, shellTestId);
}
