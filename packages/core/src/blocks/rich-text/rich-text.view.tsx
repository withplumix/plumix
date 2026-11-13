import type { ReactNode } from "react";

import type { BlockLoaderRecord } from "../loaders.js";
import type {
  BlockViewProps,
  MaterializedAttrs,
} from "../render-block-tree.js";
import { useHtmlAllowlist } from "../html/context.js";
import { sanitizeHtml } from "../html/sanitize.js";
import { expandShortcodes } from "../shortcodes/expand.js";

/** Body shortcodes such as a site-title macro read the `site` group. */
export const deps = { settings: ["site"] } as const;

/**
 * The trust boundary is the stored bytes: a string body is authored HTML and
 * is sanitised at render like `core/html`, which also covers content stored
 * before this gate.
 */
export default function RichTextView({
  attrs,
  context,
  deps: loaded,
}: BlockViewProps<
  MaterializedAttrs,
  BlockLoaderRecord,
  typeof deps
>): ReactNode {
  const allowlist = useHtmlAllowlist();
  if (typeof attrs.body !== "string") return <div />;
  // Shortcode output is escaped, so a single sanitise over the expansion
  // covers both the body and the expanded result.
  const expanded = context.shortcodes
    ? expandShortcodes(attrs.body, context.shortcodes, {
        siteSettings: loaded.settings.site ?? {},
        locale: context.locale,
        entry: context.entry,
      })
    : attrs.body;
  return (
    <div
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(expanded, allowlist) }}
    />
  );
}
