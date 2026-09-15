import type { FieldTypeOptions } from "plumix/plugin";

/**
 * The admin field types this plugin contributes. The server declares them from
 * here and the admin entry exports each component by the name given, so the
 * plumix bundler can join the two.
 */
export const MEDIA_FIELD_TYPES: readonly FieldTypeOptions[] = [
  { type: "media", component: "MediaPickerField" },
  { type: "mediaList", component: "MediaListPickerField" },
  // Url-valued variant for CSS surfaces (the Styles-tab background control).
  { type: "mediaUrl", component: "MediaUrlField" },
  // Visual crop-anchor picker for the image block's focal point.
  { type: "focalPoint", component: "FocalPointField" },
];
