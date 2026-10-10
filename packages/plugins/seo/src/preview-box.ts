import type { MetaBoxFieldInput } from "plumix/fields";

/** Shared by server and admin: a mismatch silently degrades to a text input. */
export const SERP_PREVIEW_INPUT_TYPE = "seoSerpPreview";

/**
 * Stores nothing; a meta box is a set of fields, so the preview needs a key.
 */
export const SERP_PREVIEW_FIELD_KEY = "seo_preview";

/** The preview as the entry box declares it. */
export const SERP_PREVIEW_FIELD: MetaBoxFieldInput = {
  key: SERP_PREVIEW_FIELD_KEY,
  label: {
    id: "plugin.seo.box.preview.label",
    message: "Search result preview",
  },
  type: "json",
  inputType: SERP_PREVIEW_INPUT_TYPE,
};
