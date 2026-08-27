import type { MessageDescriptor } from "plumix/i18n";

// Descriptors for the entry-editor card preview. Kept in their own module so
// the link table below and the component read one source, and so a catalog
// extraction sees every string in one place.
export const M = {
  loading: {
    id: "plugin.og.preview.loading",
    message: "Rendering…",
  },
  failed: {
    id: "plugin.og.preview.failed",
    message: "Could not render the preview.",
  },
  unsaved: {
    id: "plugin.og.preview.unsaved",
    message: "Save the entry to see how it will be shared.",
  },
  refresh: {
    id: "plugin.og.preview.refresh",
    message: "Refresh",
  },
  alt: {
    id: "plugin.og.preview.alt",
    message: "Preview of the image this entry will be shared with",
  },
  outcomeOgImage: {
    id: "plugin.og.preview.outcome.ogImage",
    message: "The share image set on this entry, which outranks the card.",
  },
  outcomeCard: {
    id: "plugin.og.preview.outcome.card",
    message: "A card generated from this entry.",
  },
  outcomeFeatured: {
    id: "plugin.og.preview.outcome.featured",
    message: "This entry's featured image.",
  },
  outcomeSiteDefault: {
    id: "plugin.og.preview.outcome.siteDefault",
    message: "The site-wide default image.",
  },
  outcomeSupplied: {
    id: "plugin.og.preview.outcome.supplied",
    message: "An image another plugin supplied.",
  },
  skipNoRule: {
    id: "plugin.og.preview.skip.noRule",
    message: "No card rule matches this entry.",
  },
  skipRendererFormat: {
    id: "plugin.og.preview.skip.rendererFormat",
    message: "The renderer makes a format social networks do not display.",
  },
  skipNotShareable: {
    id: "plugin.og.preview.skip.notShareable",
    message: "No card: this entry is not publicly reachable.",
  },
  skipFeaturedPreferred: {
    id: "plugin.og.preview.skip.featuredPreferred",
    message: "The card steps aside for the featured image.",
  },
  skipPageKind: {
    id: "plugin.og.preview.skip.pageKind",
    message: "Only entries get a card.",
  },
} satisfies Record<string, MessageDescriptor>;
