import { describe, expect, test } from "vitest";

import { renderCommentBody } from "./render-body.js";

describe("renderCommentBody", () => {
  test("renders basic markdown formatting", () => {
    const html = renderCommentBody("**bold** and _italic_ and `code`");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<code>code</code>");
  });

  test("renders lists and blockquotes", () => {
    const html = renderCommentBody("> quote\n\n- one\n- two");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
  });

  test("links carry rel='nofollow ugc noopener'", () => {
    const html = renderCommentBody("[plumix](https://plumix.dev)");
    expect(html).toContain('href="https://plumix.dev"');
    expect(html).toContain('rel="nofollow ugc noopener"');
  });

  test("raw HTML is escaped, never parsed", () => {
    const html = renderCommentBody("<script>alert('xss')</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("inline raw HTML does not produce live tags or attributes", () => {
    const html = renderCommentBody('<img src=x onerror="alert(1)">');
    // Escaped to inert text — no live <img> element, no real attribute.
    expect(html).not.toContain("<img");
    expect(html).not.toContain('onerror="');
    expect(html).toContain("&lt;img");
  });

  test("javascript: scheme links produce no active href", () => {
    const html = renderCommentBody("[click](javascript:alert(1))");
    expect(html.toLowerCase()).not.toContain('href="javascript:');
    expect(html).not.toContain("<a ");
  });

  test("data: scheme links produce no active href", () => {
    const html = renderCommentBody("[x](data:text/html;base64,PHNjcmlwdD4=)");
    expect(html.toLowerCase()).not.toContain('href="data:');
    expect(html).not.toContain("<a ");
  });
});
