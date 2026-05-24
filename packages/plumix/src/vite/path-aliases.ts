interface PathAlias {
  readonly find: string;
  readonly replacement: string;
}

/**
 * Project-root path aliases Vite resolves on every import. Matches
 * Nuxt's convention so `~/foo` and `@/foo` both point at `<root>/foo`
 * for `theme.css` paths, component imports, image references, etc.
 *
 * Only the slash-terminated forms are registered — a bare `~` or `@`
 * alias would shadow scoped-package specifiers like `@plumix/core`.
 */
export function plumixPathAliases(root: string): readonly PathAlias[] {
  return [
    { find: "~/", replacement: root + "/" },
    { find: "@/", replacement: root + "/" },
  ];
}
