// The closed-admin plugin seam in one suite: the /pages/$ catch-all
// route (not-found, capability gate, not-loaded diagnostic), the
// build-time runtime alias seam proven against a real built plugin
// chunk, and block registration through the window.plumix bridge.

import { expect, test } from "@playwright/test";

import type { AuthSessionOutput } from "@plumix/core";
import type { PlumixManifest } from "@plumix/core/manifest";

import { editorEntry } from "./support/editor.js";
import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  mockRpc,
  mockSession,
  withCapabilities,
} from "./support/rpc-mock.js";

test.describe("plugin catch-all route (/pages/$)", () => {
  const AUTHED_ADMIN_WITH_MENU_CAP = withCapabilities(
    AUTHED_ADMIN,
    "menu:manage",
  );

  const AUTHED_EDITOR: AuthSessionOutput = {
    user: {
      id: 2,
      email: "editor@example.test",
      name: "Editor",
      avatarUrl: null,
      role: "editor",
      capabilities: [
        "entry:post:create",
        "entry:post:edit_any",
        "entry:post:edit_own",
        "entry:post:read",
        "term:taxonomy:manage",
      ],
    },
    needsBootstrap: false,
  };

  const MANIFEST_WITH_PLUGIN_PAGE: PlumixManifest = {
    adminNav: [
      {
        id: "appearance",
        label: "Appearance",
        priority: 40,
        items: [
          {
            to: "/pages/menus",
            label: "Menus",
            order: 1,
            capability: "menu:manage",
            coreIcon: "puzzle",
            component: "MenusPage",
          },
        ],
      },
    ],
  };

  test("unknown plugin path falls through to the TanStack Router not-found handler", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_PLUGIN_PAGE);
    await mockSession(page, AUTHED_ADMIN_WITH_MENU_CAP);

    await page.goto("pages/unknown");
    await expect(page.getByTestId("not-found-page")).toBeVisible();
  });

  test("plugin path without the required capability redirects to dashboard", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_PLUGIN_PAGE);
    await mockSession(page, AUTHED_EDITOR);

    await page.goto("pages/menus");
    await expect(page.getByTestId("dashboard-welcome-heading")).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("plugin path with component not registered shows the not-loaded diagnostic", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_PLUGIN_PAGE);
    await mockSession(page, AUTHED_ADMIN_WITH_MENU_CAP);

    await page.goto("pages/menus");
    await expect(
      page.getByTestId("plugin-page__not-loaded__/menus"),
    ).toBeVisible();
  });
});

test.describe("plugin runtime alias seam", () => {
  const PROOF_CAPABILITY = "plugin:runtime-proof";

  const MANIFEST: PlumixManifest = {
    adminNav: [
      {
        id: "appearance",
        label: "Appearance",
        priority: 40,
        items: [
          {
            to: "/pages/__runtime-proof",
            label: "Runtime Proof",
            order: 1,
            capability: PROOF_CAPABILITY,
            coreIcon: "puzzle",
            component: "MediaLibrary",
          },
        ],
      },
    ],
  };

  // Build-time alias seam proof — assertions are inline below, one per
  // failure mode of the seam (React, React-Query, useNavigate, Tailwind).
  test("plugin shares React, QueryClient, router, and Tailwind with the host", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST);
    await mockSession(page, withCapabilities(AUTHED_ADMIN, PROOF_CAPABILITY));

    await page.goto("pages/__runtime-proof");

    // The plugin's component mounted at all → admin's catch-all route
    // resolved the registered component out of `window.plumix`.
    const root = page.getByTestId("runtime-proof");
    await expect(root).toBeVisible();

    // (1) React state — useState renders + updates
    const count = page.getByTestId("runtime-proof-count");
    await expect(count).toHaveText("0");
    await page.getByTestId("runtime-proof-inc").click();
    await expect(count).toHaveText("1");

    // (2) QueryClient is shared
    await expect(
      page.getByTestId("runtime-proof-shares-queryclient"),
    ).toHaveAttribute("data-shared", "true");

    // (3) useQuery actually runs end-to-end
    const queryStatus = page.getByTestId("runtime-proof-query-status");
    await expect(queryStatus).toHaveAttribute("data-status", "success");
    await expect(queryStatus).toHaveAttribute("data-http", "200");

    // (4) Cache is shared — getQueryData reads back the resolved value
    await expect(
      page.getByTestId("runtime-proof-shares-cache"),
    ).toHaveAttribute("data-shared", "true");

    // (5) Tailwind utility class lands on the rendered button
    const incButton = page.getByTestId("runtime-proof-inc");
    const buttonBg = await incButton.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    // `bg-primary` resolves to a non-transparent colour via admin's
    // theme tokens. Exact RGB depends on theme; assert it's not the
    // transparent default and not white-on-white.
    expect(buttonBg).not.toBe("rgba(0, 0, 0, 0)");
    expect(buttonBg).not.toBe("rgb(255, 255, 255)");

    // (5b) A shared shadcn component from `plumix/admin/ui` renders inside
    // the plugin chunk. The Button is bundled, but its `radix-ui` (Tooltip
    // context) and `tailwind-merge` (`cn`) deps resolve through the host
    // shims — so it gets the shell's `bg-primary` token without bundling
    // radix. Visible + non-transparent proves the whole chain.
    const sharedButton = page.getByTestId("runtime-proof-ui-button");
    await expect(sharedButton).toBeVisible();
    const sharedButtonBg = await sharedButton.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(sharedButtonBg).not.toBe("rgba(0, 0, 0, 0)");
    expect(sharedButtonBg).not.toBe("rgb(255, 255, 255)");

    // (5c) Hovering opens the radix Tooltip. The plugin's bundled Tooltip
    // wrapper resolves `radix-ui` to the host shim, so it shares the
    // shell's radix context + `<TooltipProvider>` — if radix were bundled
    // per-chunk (separate context), the content would never mount. This is
    // the assertion that proves context sharing, not just bundling.
    await sharedButton.hover();
    await expect(page.getByTestId("runtime-proof-ui-tooltip")).toBeVisible();

    // (5d) A shared-component *variant the admin shell never renders*
    // (`size="icon-xs"`) still lands styled. The shell's globals.css
    // `@source`s `admin-ui/src`, so Tailwind extracts every cva variant
    // string from `button.tsx` — `icon-xs` → `size-6` ships in shell CSS
    // even though no shell route uses it. Without that scan a plugin
    // reaching an unused variant would render unstyled. `size-6` is
    // 24×24 with no padding/border, so a styled button measures exactly
    // 24px; an unstyled one sizes to its glyph.
    const iconButton = page.getByTestId("runtime-proof-ui-icon-button");
    const iconBox = await iconButton.evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: s.width, height: s.height };
    });
    expect(iconBox).toEqual({ width: "24px", height: "24px" });

    // (6) Router hook navigates inside admin
    await page.getByTestId("runtime-proof-navigate").click();
    await expect(page).toHaveURL(/\/_plumix\/admin\/?$/);

    // (7) The orpc trio resolves through the runtime — plugins can
    // construct an orpc client + tanstack-query utils against their
    // own router type without bundling a private copy.
    await page.goto("pages/__runtime-proof");
    await expect(page.getByTestId("runtime-proof-shares-orpc")).toHaveAttribute(
      "data-shared",
      "true",
    );
  });
});

test.describe("plugin block registered via window.plumix bridge", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  // Guardrail proving a plugin block registered via
  // `window.plumix.registerPluginBlock(spec)` at chunk-evaluation time
  // reaches the editor's runtime registry and surfaces in the inserter
  // + slash menu. Simulates the plugin-chunk side effect without
  // needing a multi-plugin playground: an `addInitScript` traps the
  // first assignment to `window.plumix` (by `bootPlumixGlobals`) and
  // immediately registers a stub block against the just-installed
  // bridge.
  test("a block registered at chunk-eval time surfaces in the inserter + slash menu", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_POST);
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": editorEntry(),
    });

    // Trap the first `window.plumix = ...` assignment (done by
    // `bootPlumixGlobals` early in main.tsx). At that moment the bridge
    // is live but no plugin chunks have run yet — perfect proxy for
    // what a real `<script data-plumix-plugin>` would do once its
    // module evaluates.
    await page.addInitScript(() => {
      let trapped: unknown;
      Object.defineProperty(window, "plumix", {
        configurable: true,
        get() {
          return trapped;
        },
        set(value: {
          registerPluginBlock?: (spec: Record<string, unknown>) => void;
        }) {
          trapped = value;
          value.registerPluginBlock?.({
            name: "test/fake",
            title: "Fake test block",
            icon: "Code",
            category: "text",
            inputs: [],
            defaults: {},
            render: () => null,
          });
        },
      });
    });

    await page.goto("entries/posts/1/edit");

    // The block is wired in two places — the inserter sidebar list and
    // the slash menu. Asserting both proves the runtime registry feeds
    // every consumer that the hardcoded `coreBlocks` import used to.
    // The Drawer renders a drag-preview twin of each row — scope
    // through Puck's item wrapper.
    await expect(
      page
        .getByTestId("drawer-item:test/fake")
        .getByTestId("plumix-blocks-tab-item-test/fake"),
    ).toBeVisible();

    const canvas = page.getByTestId("plumix-editor-canvas");
    await canvas.focus();
    await page.keyboard.press("/");
    await page.keyboard.type("fake");
    await expect(page.getByTestId("slash-menu-item-test/fake")).toBeVisible();
  });
});
