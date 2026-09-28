import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { createBlockRegistry } from "../block-registry.js";
import { Link, PlumixProvider } from "./index.js";

const registry = createBlockRegistry([]);

function render(node: React.ReactNode, basePath = ""): string {
  return renderToStaticMarkup(
    <PlumixProvider value={{ registry, basePath }}>{node}</PlumixProvider>,
  );
}

describe("Link", () => {
  test("renders an anchor for a raw href", () => {
    expect(render(<Link href="/about">About</Link>)).toBe(
      '<a href="/about">About</a>',
    );
  });

  test("prefixes a raw href with the configured basePath", () => {
    expect(render(<Link href="/about">About</Link>, "/blog")).toBe(
      '<a href="/blog/about">About</a>',
    );
  });

  test("uses an entry's pre-resolved url as-is, without re-prefixing basePath", () => {
    expect(
      render(<Link entry={{ url: "/blog/hello" }}>Hello</Link>, "/blog"),
    ).toBe('<a href="/blog/hello">Hello</a>');
  });

  test("uses a term's pre-resolved url", () => {
    expect(render(<Link term={{ url: "/category/news" }}>News</Link>)).toBe(
      '<a href="/category/news">News</a>',
    );
  });

  test("does not basePath-prefix fragment- or query-only hrefs", () => {
    expect(render(<Link href="#main">Skip</Link>, "/blog")).toBe(
      '<a href="#main">Skip</a>',
    );
    expect(render(<Link href="?page=2">Next</Link>, "/blog")).toBe(
      '<a href="?page=2">Next</a>',
    );
  });

  test("merges a caller's rel with the safe default on external links", () => {
    expect(
      render(
        <Link href="https://example.com" rel="author">
          Ext
        </Link>,
      ),
    ).toBe(
      '<a href="https://example.com" rel="author noopener noreferrer">Ext</a>',
    );
  });

  test("renders children unwrapped when the target has no url", () => {
    expect(render(<Link entry={{ url: null }}>Draft</Link>)).toBe("Draft");
  });

  test("adds safe rel to an external href and skips basePath", () => {
    expect(render(<Link href="https://example.com">Ext</Link>, "/blog")).toBe(
      '<a href="https://example.com" rel="noopener noreferrer">Ext</a>',
    );
  });

  test("passes through standard anchor attributes", () => {
    expect(
      render(
        <Link href="/x" className="btn" target="_blank">
          x
        </Link>,
      ),
    ).toBe('<a href="/x" class="btn" target="_blank">x</a>');
  });

  test("refuses to render an anchor for a dangerous-scheme href", () => {
    for (const href of [
      "javascript:alert(1)",
      "  javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "java\tscript:alert(1)",
      "data:text/html,<script>",
      "vbscript:msgbox(1)",
      "blob:https://x/abc",
      "view-source:javascript:alert(1)",
    ]) {
      expect(render(<Link href={href}>x</Link>)).toBe("x");
    }
  });
});
