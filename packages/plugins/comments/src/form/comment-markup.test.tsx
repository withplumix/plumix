import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { CommentMarkupProps } from "./comment-markup.js";
import { CommentMarkup } from "./comment-markup.js";

const render = (props: Partial<CommentMarkupProps> = {}): string =>
  renderToStaticMarkup(
    <CommentMarkup
      action="/_plumix/comments/submit"
      entryId={7}
      idBase="c"
      {...props}
    />,
  );

describe("the controls a visitor is given", () => {
  test("posts to the endpoint as a plain form, with no enctype of its own", () => {
    const html = render();

    expect(html).toContain('method="post"');
    expect(html).toContain('action="/_plumix/comments/submit"');
    expect(html).not.toContain("enctype");
  });

  test("carries the entry it is commenting on", () => {
    expect(render()).toContain('name="entryId" value="7"');
  });

  test("carries a parent only where there is one to reply to", () => {
    expect(render()).not.toContain('name="parentId"');
    expect(render({ parentId: 12 })).toContain('name="parentId" value="12"');
  });

  test("carries where to go back to only where it was told", () => {
    expect(render()).not.toContain('name="returnTo"');
    expect(render({ returnTo: "https://cms.example/posts/post" })).toContain(
      'name="returnTo" value="https://cms.example/posts/post"',
    );
  });

  test("points each label at its own control", () => {
    const html = render();

    expect(html).toContain('for="c-name"');
    expect(html).toContain('id="c-name"');
    expect(html).toContain('for="c-body"');
    expect(html).toContain('id="c-body"');
  });

  test("puts the visitor's words back when it is handed to them again", () => {
    const html = render({
      values: { name: "Ada", email: "ada@example.test", body: "worth keeping" },
    });

    expect(html).toContain('value="Ada"');
    expect(html).toContain('value="ada@example.test"');
    expect(html).toContain("worth keeping");
  });

  test("drops `required` from the email when the install does not ask for one", () => {
    expect(render()).toMatch(
      /data-plumix-comment-control="email"[^>]*required/,
    );
    expect(render({ requireEmail: false })).not.toMatch(
      /data-plumix-comment-control="email"[^>]*required/,
    );
  });
});

describe("a refusal, against the control that produced it", () => {
  const errors = [{ field: "email", message: "An email address is required." }];

  test("points the control at its own error, and marks it invalid", () => {
    const html = render({ errors });

    expect(html).toMatch(
      /data-plumix-comment-control="email"[^>]*aria-invalid="true"/,
    );
    expect(html).toMatch(
      /data-plumix-comment-control="email"[^>]*aria-describedby="c-email-error"/,
    );
    expect(html).toContain('id="c-email-error"');
  });

  test("leaves a control nothing was said about undescribed", () => {
    const html = render({ errors });

    expect(html).not.toMatch(
      /data-plumix-comment-control="name"[^>]*aria-invalid/,
    );
  });

  test("summarises it as a link to the control", () => {
    const html = render({ errors });

    expect(html).toContain('role="alert"');
    expect(html).toContain('href="#c-email"');
  });

  test("summarises a refusal naming no field as text rather than a link", () => {
    const html = render({
      errors: [{ field: "", message: "Too many comments." }],
    });

    expect(html).toContain("Too many comments.");
    expect(html).not.toContain('href="#c-"');
  });
});

describe("the honeypot", () => {
  test("is in the markup, out of the tab order and out of the reading order", () => {
    const html = render();

    expect(html).toContain('name="website"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toMatch(/data-plumix-comment-honeypot[^>]*aria-hidden="true"/);
  });

  test("is never a hidden input, which a bot skips", () => {
    expect(render()).not.toContain('type="hidden" name="website"');
  });

  test("is never filled in for the bot that tripped it", () => {
    const html = render({
      values: { name: "Bot", email: "bot@example.test", body: "buy things" },
    });

    expect(html).not.toMatch(/name="website"[^>]*value="[^"]+"/);
  });
});

describe("what the island turns on", () => {
  test("keeps the browser's own checks until JavaScript is actually running", () => {
    // Case-insensitively: React renders the attribute as it is spelled in
    // JSX, and HTML attribute names are case-insensitive.
    expect(render()).not.toMatch(/novalidate/i);
    expect(render({ enhanced: true })).toMatch(/novalidate/i);
  });

  test("disables the submit button while one is in flight", () => {
    expect(render({ busy: true })).toMatch(
      /data-plumix-comment-submit[^>]*disabled/,
    );
  });
});
