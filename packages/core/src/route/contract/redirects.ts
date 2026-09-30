/**
 * The shape of a public-route redirect rule, as the site (`config.redirects`),
 * a plugin (`registerRedirects`) and the theme (`redirects`) declare one. The
 * matcher that applies them is `route/redirects.ts`.
 */

export type RedirectStatus = 301 | 302 | 307 | 308;

/** What a rule (static or dynamic) yields on a match, before normalization. */
export type RedirectTarget =
  | {
      readonly to: string;
      readonly status?: RedirectStatus;
      /**
       * Append the request's query string to `to` (unless `to` carries its own
       * `?…`). Defaults to `true` — the migration-friendly default, matching a
       * CDN "preserve query string" toggle. Set `false` to redirect to exactly
       * `to`.
       */
      readonly preserveQuery?: boolean;
    }
  | { readonly gone: true };

export type RedirectRule =
  | ({ readonly from: string | RegExp } & RedirectTarget & {
        readonly priority?: number;
      })
  | {
      readonly match: (url: URL) => RedirectTarget | null;
      readonly priority?: number;
    };
