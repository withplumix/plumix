import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

// Extraction mirror for the editor command palette's built-in command titles
// (see `core-settings-i18n.ts` for the pattern). The palette renders them off
// the descriptors `@plumix/admin-editor` exports; that package builds with
// `tsc`, which never runs the macro, so these `defineMessage` calls exist only
// so admin's `lingui extract` pulls the ids into `locales/*.po`. Lockstep with
// `EDITOR_COMMAND_DESCRIPTORS` is test-guarded.
export const EDITOR_COMMAND_MIRROR = {
  xray: defineMessage({
    id: "editor.command.xray",
    message: "Toggle X-ray outlines",
  }),
  group: defineMessage({
    id: "editor.command.group",
    message: "Group the selection",
  }),
  ungroup: defineMessage({
    id: "editor.command.ungroup",
    message: "Ungroup the selected block",
  }),
  deviceDesktop: defineMessage({
    id: "editor.command.device.desktop",
    message: "Switch to desktop",
  }),
  deviceTablet: defineMessage({
    id: "editor.command.device.tablet",
    message: "Switch to tablet",
  }),
  deviceMobile: defineMessage({
    id: "editor.command.device.mobile",
    message: "Switch to mobile",
  }),
  revisions: defineMessage({
    id: "editor.command.revisions",
    message: "Open revisions",
  }),
} satisfies Record<string, MessageDescriptor>;
