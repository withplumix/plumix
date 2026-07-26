import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { DevErrorFrame } from "./contract.js";
import { enhanceDevError } from "./enhance.js";
import { DevErrorPage } from "./error-page.js";

const frames: DevErrorFrame[] = [
  {
    functionName: "render",
    file: "/proj/src/theme.tsx",
    line: 12,
    column: 7,
    isVendor: false,
  },
  {
    functionName: "loader",
    file: "/proj/src/data.ts",
    line: 4,
    column: 2,
    isVendor: false,
  },
  {
    functionName: "renderToString",
    file: "/proj/node_modules/react-dom/server.js",
    line: 100,
    column: 5,
    isVendor: true,
  },
];

// A fake resolver: returns a three-line excerpt whose highlighted middle line
// echoes the requested file:line, so a test can prove which frame drove it.
function fakeFetch(overrides?: { ok?: boolean }) {
  return vi.fn((url: string) => {
    const parsed = new URL(url, "http://localhost");
    const file = parsed.searchParams.get("file");
    const line = Number(parsed.searchParams.get("line"));
    return Promise.resolve({
      ok: overrides?.ok ?? true,
      json: () =>
        Promise.resolve({
          file,
          line,
          lines: [
            { number: line - 1, content: "before", highlighted: false },
            { number: line, content: `at ${file}:${line}`, highlighted: true },
            { number: line + 1, content: "<b>after</b>", highlighted: false },
          ],
        }),
    });
  });
}

function mount(): void {
  document.body.innerHTML = renderToStaticMarkup(
    <DevErrorPage error={{ name: "TypeError", message: "boom", frames }} />,
  );
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const SOURCE = '[data-testid="plumix-dev-error-source"]';
const FRAME = '[data-testid="plumix-dev-error-frame"]';

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("enhanceDevError", () => {
  test("auto-selects the first frame and renders its highlighted excerpt", async () => {
    mount();
    const fetchImpl = fakeFetch();

    enhanceDevError(document, fetchImpl as unknown as typeof fetch);
    await flush();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const requested = new URL(
      String(fetchImpl.mock.calls[0]?.[0]),
      "http://localhost",
    );
    expect(requested.pathname).toBe("/@plumix-dev-error-source");
    expect(requested.searchParams.get("file")).toBe("/proj/src/theme.tsx");
    expect(requested.searchParams.get("line")).toBe("12");

    const highlighted = document
      .querySelector(SOURCE)
      ?.querySelector(".plumix-dev-error__line--highlighted");
    expect(highlighted?.textContent).toContain("at /proj/src/theme.tsx:12");

    // The excerpt header is shown relative to the project root, not absolute.
    expect(
      document.querySelector(".plumix-dev-error__excerpt-head")?.textContent,
    ).toBe("src/theme.tsx:12");

    // The first frame button is marked current.
    expect(
      document.querySelectorAll(FRAME).item(0).getAttribute("aria-current"),
    ).toBe("true");
  });

  test("selecting another frame fetches and shows its source, moving the marker", async () => {
    mount();
    const fetchImpl = fakeFetch();
    enhanceDevError(document, fetchImpl as unknown as typeof fetch);
    await flush();

    const buttons = document.querySelectorAll<HTMLElement>(FRAME);
    buttons.item(1).click();
    await flush();

    const lastCall = String(fetchImpl.mock.calls.at(-1)?.[0]);
    expect(new URL(lastCall, "http://localhost").searchParams.get("file")).toBe(
      "/proj/src/data.ts",
    );

    expect(document.querySelector(SOURCE)?.textContent).toContain(
      "at /proj/src/data.ts:4",
    );
    expect(buttons.item(0).getAttribute("aria-current")).toBeNull();
    expect(buttons.item(1).getAttribute("aria-current")).toBe("true");
  });

  test("renders excerpt content as text, never as markup", async () => {
    mount();
    enhanceDevError(document, fakeFetch() as unknown as typeof fetch);
    await flush();

    const panel = document.querySelector(SOURCE);
    // The `<b>after</b>` line is shown literally, not parsed into an element.
    expect(panel?.querySelector("b")).toBeNull();
    expect(panel?.textContent).toContain("<b>after</b>");
  });

  test("shows a message when the source cannot be loaded", async () => {
    mount();
    enhanceDevError(
      document,
      fakeFetch({ ok: false }) as unknown as typeof fetch,
    );
    await flush();

    const panel = document.querySelector(SOURCE);
    const text = panel?.textContent ?? "";
    expect(text.toLowerCase()).toContain("could not load");
    expect(panel?.querySelector(".plumix-dev-error__line")).toBeNull();
  });

  test("does nothing when the page has no frame view", () => {
    document.body.innerHTML = renderToStaticMarkup(
      <DevErrorPage error={{ name: "Error", message: "boom" }} />,
    );
    const fetchImpl = fakeFetch();

    expect(() =>
      enhanceDevError(document, fetchImpl as unknown as typeof fetch),
    ).not.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
