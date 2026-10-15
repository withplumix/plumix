interface EmbedFrameAttributes {
  readonly sandbox?: "allow-scripts";
  readonly referrerPolicy: "no-referrer" | "strict-origin-when-cross-origin";
}

/**
 * An untrusted host runs scripts without same-origin and never learns our
 * origin; a safelisted provider gets neither restriction.
 */
export function embedFrameAttributes(sandboxed: boolean): EmbedFrameAttributes {
  return sandboxed
    ? { sandbox: "allow-scripts", referrerPolicy: "no-referrer" }
    : { referrerPolicy: "strict-origin-when-cross-origin" };
}
