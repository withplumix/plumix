/**
 * Reserved entry-meta key holding an author's `named`-template choice — the
 * editor writes it, the resolver reads it. Part of the `__plumix_*` namespace.
 *
 * In its own zero-dependency module so the autosave overlay in `revisions/` can
 * keep the pick without importing the route that resolves it.
 */
export const NAMED_TEMPLATE_META_KEY = "__plumix_template";
