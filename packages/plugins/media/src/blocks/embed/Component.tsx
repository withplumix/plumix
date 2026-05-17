import type { BlockProps } from "plumix/blocks";
import type { ReactElement } from "react";

import { resolveOEmbed } from "./safelist.js";

// Generic sandbox for non-safelist URLs. Deliberately omits
// `allow-same-origin` — together with `allow-scripts` it lets the
// iframe call `parent.document` if the URL is same-origin and lets it
// rewrite its own sandbox via DOM mutation. For unknown third-party
// hosts we keep the iframe in a fully sandboxed origin (`null`).
const GENERIC_SANDBOX = "allow-scripts allow-presentation";

export function EmbedComponent({ attrs }: BlockProps): ReactElement | null {
  const url = typeof attrs.url === "string" ? attrs.url : "";
  if (url.length === 0) return null;
  const title =
    typeof attrs.title === "string" ? attrs.title : "Embedded content";
  const resolved = resolveOEmbed(url);
  if (resolved) {
    return (
      <div
        data-plumix-block="media/embed"
        data-provider={resolved.provider}
        data-loading="lazy"
      >
        <iframe
          src={resolved.embedUrl}
          title={title}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          {...(resolved.allow.length > 0 && { allow: resolved.allow })}
          allowFullScreen
        />
      </div>
    );
  }
  // Non-safelist URL: fully sandboxed iframe so untrusted hosts can't
  // escape via the `allow-scripts`+`allow-same-origin` footgun.
  return (
    <div
      data-plumix-block="media/embed"
      data-provider="generic"
      data-loading="lazy"
    >
      <iframe
        src={url}
        title={title}
        loading="lazy"
        sandbox={GENERIC_SANDBOX}
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
