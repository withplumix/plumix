import type { AppContext } from "plumix/plugin";
import { renderToStaticMarkup } from "react-dom/server";

import type { CommentFormError } from "../form/comment-form.js";
import { CommentForm } from "../form/comment-form.js";

/**
 * SPIKE P3 — what a visitor without JavaScript gets when the comment is
 * refused: the same form back, carrying what they typed and the error
 * against the field that produced it. A redirect would have lost both.
 *
 * It is the form alone rather than the page it came from — the plugin
 * owns the endpoint, not the theme's template — so it inherits none of
 * the site's chrome.
 */
export function commentRejectPage(
  ctx: AppContext,
  input: {
    readonly action: string;
    readonly entryId: number;
    readonly parentId: number | null;
    readonly returnTo: string;
    readonly values: Readonly<Record<string, string>>;
    readonly errors: readonly CommentFormError[];
    readonly status: number;
  },
): Response {
  const body = renderToStaticMarkup(
    <html lang={ctx.locale.code} dir={ctx.locale.direction}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>Comment not accepted</title>
      </head>
      <body>
        <main>
          <CommentForm
            action={input.action}
            entryId={input.entryId}
            parentId={input.parentId}
            returnTo={input.returnTo}
            values={input.values}
            errors={input.errors}
          />
        </main>
      </body>
    </html>,
  );
  return new Response(`<!doctype html>${body}`, {
    status: input.status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
