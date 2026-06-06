import { createUsePuck } from "@puckeditor/core";

// Single selector-hook instance shared by the editor chrome, following
// upstream's custom-ui example. The legacy bare `usePuck()` re-renders
// its caller on every Puck store change — per keystroke once typing
// syncs — while a selector re-renders only when its slice does. Pair
// with `useGetPuck` for click-time reads that need no subscription.
export const usePuckSelector = createUsePuck();
