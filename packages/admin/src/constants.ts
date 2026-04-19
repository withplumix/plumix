// Single source of truth for where the admin mounts. Vite's `base` option
// wants a trailing slash; TanStack Router's `basepath` wants it without.
// Derive both from one constant here so changing the mount point is a
// single-file edit.
export const ADMIN_BASE_PATH = "/_plumix/admin" as const;
