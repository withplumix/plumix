// Shim for `radix-ui`: re-exports the host admin shell's instance from
// `window.plumix.runtime.radix` so plugin chunks share it instead of
// bundling their own copy. The plugin-bundle Vite step aliases bare
// `radix-ui` imports here (see SHARED_ADMIN_RUNTIME_SPECIFIERS in
// @plumix/core). Re-export every public upstream member — shim-drift.test.ts
// fails CI if this falls behind upstream. Each export is annotated with its
// upstream type so declaration emit references `radix-ui` rather than the
// non-portable per-primitive sub-package paths (TS2883).
import type * as RadixNs from "radix-ui";

import { getRuntime } from "./runtime.js";

const ns = getRuntime().radix;

export default ns;

export const AccessibleIcon: typeof RadixNs.AccessibleIcon = ns.AccessibleIcon;
export const Accordion: typeof RadixNs.Accordion = ns.Accordion;
export const AlertDialog: typeof RadixNs.AlertDialog = ns.AlertDialog;
export const AspectRatio: typeof RadixNs.AspectRatio = ns.AspectRatio;
export const Avatar: typeof RadixNs.Avatar = ns.Avatar;
export const Checkbox: typeof RadixNs.Checkbox = ns.Checkbox;
export const Collapsible: typeof RadixNs.Collapsible = ns.Collapsible;
export const ContextMenu: typeof RadixNs.ContextMenu = ns.ContextMenu;
export const Dialog: typeof RadixNs.Dialog = ns.Dialog;
export const Direction: typeof RadixNs.Direction = ns.Direction;
export const DropdownMenu: typeof RadixNs.DropdownMenu = ns.DropdownMenu;
export const Form: typeof RadixNs.Form = ns.Form;
export const HoverCard: typeof RadixNs.HoverCard = ns.HoverCard;
export const Label: typeof RadixNs.Label = ns.Label;
export const Menubar: typeof RadixNs.Menubar = ns.Menubar;
export const NavigationMenu: typeof RadixNs.NavigationMenu = ns.NavigationMenu;
export const Popover: typeof RadixNs.Popover = ns.Popover;
export const Portal: typeof RadixNs.Portal = ns.Portal;
export const Progress: typeof RadixNs.Progress = ns.Progress;
export const RadioGroup: typeof RadixNs.RadioGroup = ns.RadioGroup;
export const ScrollArea: typeof RadixNs.ScrollArea = ns.ScrollArea;
export const Select: typeof RadixNs.Select = ns.Select;
export const Separator: typeof RadixNs.Separator = ns.Separator;
export const Slider: typeof RadixNs.Slider = ns.Slider;
export const Slot: typeof RadixNs.Slot = ns.Slot;
export const Switch: typeof RadixNs.Switch = ns.Switch;
export const Tabs: typeof RadixNs.Tabs = ns.Tabs;
export const Toast: typeof RadixNs.Toast = ns.Toast;
export const Toggle: typeof RadixNs.Toggle = ns.Toggle;
export const ToggleGroup: typeof RadixNs.ToggleGroup = ns.ToggleGroup;
export const Toolbar: typeof RadixNs.Toolbar = ns.Toolbar;
export const Tooltip: typeof RadixNs.Tooltip = ns.Tooltip;
export const VisuallyHidden: typeof RadixNs.VisuallyHidden = ns.VisuallyHidden;
