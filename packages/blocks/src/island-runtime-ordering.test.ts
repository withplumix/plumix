import { afterEach, expect, test, vi } from "vitest";

// Isolated from `island-runtime.test.ts` on purpose: this file must be the
// first thing to define `<plumix-island>` in its jsdom instance, so the
// element upgrade happens *during* bootstrap — exactly as it does in the
// browser when the runtime script runs against SSR'd markup already in the
// document. `island-runtime.test.ts` appends islands AFTER bootstrap, so it
// never exercises this ordering.

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

test("an SSR'd eager island already in the DOM hydrates with the renderer URL set", async () => {
  // Arrange the page as SSR delivers it: the island markup + the bootstrap
  // script carrying the renderer URL are in the document BEFORE the runtime
  // module executes.
  const script = document.createElement("script");
  script.setAttribute("data-plumix-renderer-url", "/assets/renderer.js");
  document.head.appendChild(script);

  const el = document.createElement("plumix-island");
  el.setAttribute("client", "load");
  el.setAttribute("chunk-url", "/chunk.js");
  el.setAttribute("component-export", "default");
  el.setAttribute("ssr", "");
  document.body.appendChild(el);

  // Stub the chunk importer before the element is defined (defining it
  // upgrades the island and `load` hydrates synchronously in
  // connectedCallback). island-element doesn't auto-bootstrap, so importing
  // it here is side-effect free.
  const { setDynamicImport } = await import("./island-element.js");
  const imported: string[] = [];
  setDynamicImport((url) => {
    imported.push(url);
    return Promise.resolve({
      default: () => null,
      mount: () => ({ render: () => undefined, unmount: () => undefined }),
    });
  });

  const errors: string[] = [];
  window.addEventListener("plumix:hydration-error", (e) => {
    const detail = (e as CustomEvent<{ error?: unknown }>).detail;
    errors.push(String(detail.error));
  });

  // Importing the runtime runs `bootstrapIslandRuntime()` once: it must set
  // the renderer URL BEFORE defining the element, or the eager island
  // hydrates against a null renderer URL.
  await import("./island-runtime.js");
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(errors.join("\n")).not.toContain("island renderer URL not set");
  expect(imported).toContain("/assets/renderer.js");
});
