import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";
import { BASELINE_HTML_ALLOWLIST, sanitizeHtml } from "./sanitize.js";

export const htmlBlockV2 = defineBlock({
  name: "core/html",
  title: "HTML",
  icon: "Code",
  category: "interactive",
  inputs: [{ name: "html", type: "textarea", label: "HTML" }],
  defaults: { html: "" },
  render: ({ attrs }): ReactNode => {
    const raw = (attrs.html as string | undefined) ?? "";
    return (
      <div
        dangerouslySetInnerHTML={{
          __html: sanitizeHtml(raw, BASELINE_HTML_ALLOWLIST),
        }}
      />
    );
  },
});
