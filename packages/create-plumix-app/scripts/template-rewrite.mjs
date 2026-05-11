/**
 * Pure helpers for the template-drift-detection script. Kept side-effect
 * free so they're unit-testable; the orchestrator in
 * `typecheck-template.mjs` is the only piece that touches the
 * filesystem.
 *
 * @module template-rewrite
 */

/**
 * Rewrite the listed deps in a package.json string. Both
 * `dependencies` and `devDependencies` are scanned; override keys that
 * don't appear in either are silently skipped (the caller passes a
 * broad map covering every package the template might reference).
 *
 * Output formatting: 2-space indent + POSIX trailing newline. Any
 * comments or non-standard ordering in the input are lost — the
 * template's package.json is plain JSON we control, so this is fine.
 *
 * @param {string} raw — package.json file contents
 * @param {Record<string, string>} overrides — `{ "plumix": "workspace:*", ... }`
 * @returns {string}
 */
export function rewriteTemplatePackageJson(raw, overrides) {
  const pkg = JSON.parse(raw);
  for (const field of ["dependencies", "devDependencies"]) {
    const deps = pkg[field];
    if (deps === undefined || deps === null) continue;
    for (const [key, value] of Object.entries(overrides)) {
      if (key in deps) deps[key] = value;
    }
  }
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

/**
 * Add a path to the `packages:` list in a pnpm-workspace.yaml.
 * Idempotent — re-adding an already-present path is a no-op.
 * Everything outside the `packages:` block is preserved verbatim.
 *
 * @param {string} yamlRaw — pnpm-workspace.yaml contents
 * @param {string} path — glob to add, e.g. "packages/create-plumix-app/templates/*"
 * @returns {string}
 */
export function addWorkspacePath(yamlRaw, path) {
  const newLine = `  - "${path}"`;
  if (yamlRaw.includes(newLine)) return yamlRaw;

  const lines = yamlRaw.split("\n");
  const packagesIdx = lines.findIndex((line) => line.startsWith("packages:"));
  if (packagesIdx === -1) {
    throw new Error(
      "Cannot add workspace path — `packages:` key not found in workspace yaml.",
    );
  }

  // Walk forward from `packages:` while we see indented list items
  // (`  - "..."`), inserting after the last one.
  let insertAt = packagesIdx + 1;
  while (insertAt < lines.length && /^\s+-\s/.test(lines[insertAt] ?? "")) {
    insertAt += 1;
  }

  lines.splice(insertAt, 0, newLine);
  return lines.join("\n");
}
