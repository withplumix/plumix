"use client";

import type { ReactNode } from "react";
import { createElement as h, useEffect, useState } from "react";

// Core's own, not `plumix/blocks`: the facade withholds `sanitizeHtml`, and
// this playground is core's test site.
import { sanitizeHtml } from "@plumix/core/blocks";

declare global {
  interface Window {
    __plumixSanitize?: typeof sanitizeHtml;
  }
}

/**
 * Hands the island bundle's `sanitizeHtml`, which the `browser` field points
 * at the DOMPurify shim, to the spec's `page.evaluate`.
 */
export function SanitizeProbe(): ReactNode {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    window.__plumixSanitize = sanitizeHtml;
    setReady(true);
  }, []);
  return h("div", {
    "data-testid": "sanitize-probe",
    "data-ready": ready ? "" : undefined,
  });
}
