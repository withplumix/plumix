/**
 * The field type the preview renders under. The server names it on the meta
 * box's one field and the admin chunk registers a renderer for it; both read
 * it from here, since a mismatch degrades silently to a text input.
 */
export const CARD_PREVIEW_INPUT_TYPE = "ogCardPreview";

/**
 * The meta key the preview field occupies. It stores nothing — the renderer
 * never writes a value — but a meta box is a set of fields, so the preview
 * needs one to hang off.
 */
export const CARD_PREVIEW_FIELD_KEY = "og_card_preview";
