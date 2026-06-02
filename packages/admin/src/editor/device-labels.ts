import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

import type { StyleBucket } from "./viewport-bucket.js";

// Shared device-bucket labels. Reused by `EditorLayout` (viewport
// toolbar + accessibility label) and `StyleTab` (active-bucket pill)
// so the localized copy stays in lockstep across the two surfaces.

export const DEVICE_LABEL: Readonly<Record<StyleBucket, MessageDescriptor>> = {
  small: defineMessage({
    id: "editor.device.mobile",
    message: "Mobile",
  }),
  medium: defineMessage({
    id: "editor.device.tablet",
    message: "Tablet",
  }),
  large: defineMessage({
    id: "editor.device.desktop",
    message: "Desktop",
  }),
};
