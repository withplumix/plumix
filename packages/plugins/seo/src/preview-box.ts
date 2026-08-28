import type { MetaBoxFieldInput } from "plumix/plugin";

/**
 * The field type the SERP preview renders under. The server names it on the
 * meta box's first field and the admin chunk registers a renderer for it; both
 * read it from here, since a mismatch degrades silently to a text input.
 */
export const SERP_PREVIEW_INPUT_TYPE = "seoSerpPreview";

/**
 * The meta key the preview field occupies. It stores nothing — the renderer
 * never writes a value — but a meta box is a set of fields, so the preview
 * needs one to hang off. Prefixed like every other key this plugin owns.
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
