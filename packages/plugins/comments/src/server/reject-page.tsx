import type { AppContext } from "plumix/plugin";
import { labelSourceText } from "plumix/i18n";
import { withBasePath } from "plumix/support";
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
 * The form alone, without site chrome, since the plugin owns the endpoint, not
 * the theme. `noindex` and `no-store`: one visitor's refused comment.
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
            action={withBasePath(SUBMIT_PATH, ctx.config.basePath)}
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
