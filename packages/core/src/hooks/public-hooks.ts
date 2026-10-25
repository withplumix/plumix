// tsc drops augmentations from modules reached only through value or type
// imports; a side-effect import keeps each public hook's augmentation in the
// published declarations.
import "../rpc/hooks.js"; // entry:*, term:*, user:*, settings:* lifecycle actions
