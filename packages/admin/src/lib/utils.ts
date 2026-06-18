// `cn` now lives in @plumix/admin-ui (the shared shadcn surface) so the
// admin shell and plugin chunks compute classes identically. Re-exported
// here to keep the `@/lib/utils` import path stable across the admin.
export { cn } from "@plumix/admin-ui";
