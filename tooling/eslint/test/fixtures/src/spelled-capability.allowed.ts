declare const type: string;
declare const action: string;

// Hook names share the `entry:` / `term:` prefix but end in an event.
export const trashed = "entry:media:trashed";
export const restored = `entry:${type}:revision_restored`;
export const published = "entry:published";
export const beforeSave = `entry:${type}:before_save`;
// An action spelled at runtime is a speller, not a hand-written capability.
export const spelled = `entry:${type}:${action}`;
// Flat capabilities have no type segment.
export const moderate = "comment:moderate";
export const settings = "settings:manage";
// Two capabilities in one string are an example a user reads, not a gate.
export const placeholder = "entry:post:read\nentry:post:edit_own";
