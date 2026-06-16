import { afterEach, beforeEach, expect, test, vi } from "vitest";

// Regression (production-build-only, invisible to `plumix dev` e2e):
// the synthesised admin chunk both runs this entry's module body AND
// emits its own `registerPluginPage("/menus", MenusShell)` from the
// `ctx.registerAdminPage({ component })` declaration. If the entry
// *also* registers the page imperatively, "/menus" is registered twice
// and AdminPluginRegistryError throws at admin boot. The entry's only
// job is to expose the export by name.
const registerPluginPage = vi.fn();

beforeEach(() => {
  (window as { plumix?: unknown }).plumix = { registerPluginPage };
  vi.resetModules();
});

afterEach(() => {
  registerPluginPage.mockReset();
  delete (window as { plumix?: unknown }).plumix;
});

test("exposes MenusShell without imperatively registering the page", async () => {
  const mod = await import("./index.js");

  expect(mod.MenusShell).toBeDefined();
  expect(registerPluginPage).not.toHaveBeenCalled();
});
