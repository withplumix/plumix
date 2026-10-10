import type { FieldTypeOptions } from "plumix/plugin";

/**
 * The admin entry must export each component by the name given, so the plumix
 * bundler can join it to the server declaration.
 */
export const MEDIA_FIELD_TYPES: readonly FieldTypeOptions[] = [
  { type: "media", component: "MediaPickerField" },
  { type: "mediaList", component: "MediaListPickerField" },
  // Url-valued variant for CSS surfaces (the Styles-tab background control).
  { type: "mediaUrl", component: "MediaUrlField" },
  // Visual crop-anchor picker for the image block's focal point.
  { type: "focalPoint", component: "FocalPointField" },
];
