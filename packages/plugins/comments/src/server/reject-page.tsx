import type { AppContext } from "plumix/plugin";
import { withBasePath } from "plumix";
import { labelSourceText } from "plumix/i18n";
import { renderToStaticMarkup } from "react-dom/server";

import type { CommentFormError, CommentFormValues } from "../types.js";
import { SUBMIT_PATH } from "../contract.js";
import { CommentMarkup } from "../form/comment-markup.js";
import { REJECT_TITLE } from "../messages.js";
import { commentFormIdBase } from "../paths.js";

interface RefusedComment {
  readonly entryId: number;
  readonly parentId: number | null;
  readonly returnTo: string;
  readonly values: CommentFormValues;
  readonly errors: readonly CommentFormError[];
  readonly requireEmail: boolean;
  readonly status: number;
}

/**
 * What a visitor with no JavaScript gets when the server will not take
 * their comment: the same form back, carrying what they typed and the
 * refusal against the field that produced it. A redirect would have lost
 * both and told them nothing.
 *
 * It is the form alone rather than the post it came from — the plugin owns
 * the endpoint, not the theme's template — so it inherits none of the
 * site's chrome. `noindex` and `no-store` because it is one visitor's
 * refused comment and belongs in no index and no shared cache.
 */
export function rejectPage(ctx: AppContext, refused: RefusedComment): Response {
  const body = renderToStaticMarkup(
    <html lang={ctx.locale.code} dir={ctx.locale.direction}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>{labelSourceText(REJECT_TITLE)}</title>
      </head>
      <body>
        <main>
          <CommentMarkup
            action={withBasePath(SUBMIT_PATH, ctx.basePath)}
            entryId={refused.entryId}
            // The same ids the form on the page had, so the summary's
            // links and the labels still address the controls a visitor
            // was already looking at.
            idBase={commentFormIdBase(refused.entryId)}
            parentId={refused.parentId}
            returnTo={refused.returnTo}
            requireEmail={refused.requireEmail}
            values={refused.values}
            errors={refused.errors}
          />
        </main>
      </body>
    </html>,
  );
  return new Response(`<!doctype html>${body}`, {
    status: refused.status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
