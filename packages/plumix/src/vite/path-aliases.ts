interface PathAlias {
  readonly find: string;
  readonly replacement: string;
}

/**
 * Only slash-terminated forms: a bare `~` or `@` alias would shadow scoped
 * packages like `@plumix/core`.
 */
export function plumixPathAliases(root: string): readonly PathAlias[] {
  return [
    { find: "~/", replacement: root + "/" },
    { find: "@/", replacement: root + "/" },
  ];
}
