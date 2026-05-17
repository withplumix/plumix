import axe from "axe-core";

export class AxeViolationError extends Error {
  static {
    AxeViolationError.prototype.name = "AxeViolationError";
  }

  static forViolations(violations: readonly axe.Result[]): AxeViolationError {
    const summary = violations
      .map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`)
      .join("\n");
    return new AxeViolationError(
      `axe-core found ${violations.length} violations:\n${summary}`,
    );
  }
}

/**
 * Runs axe against a rendered DOM container and fails the test with a
 * legible list of violations when any rule fires. Targets the WCAG
 * 2.1 AA ruleset which lines up with the editor's compliance target.
 *
 * Used as a smoke check — unit tests still assert the specific ARIA
 * properties we care about; axe catches regressions in adjacent areas
 * (label/labelledby pairing, contrast on bundled styles, duplicate
 * ids when a Component is rendered twice in the same test).
 */
export async function runAxeSmokeTest(container: HTMLElement): Promise<void> {
  const results = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    // Color-contrast on jsdom is unreliable (no real layout / computed
    // colour); we cover contrast via the Playwright + @axe-core/playwright
    // e2e path. Disable here to keep vitest deterministic.
    rules: { "color-contrast": { enabled: false } },
  });
  if (results.violations.length === 0) return;
  throw AxeViolationError.forViolations(results.violations);
}
