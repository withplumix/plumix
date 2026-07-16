import { basename } from "node:path";
import * as clack from "@clack/prompts";

import type { PromptKey } from "./reconcile.js";
import type { Registry } from "./registry.js";
import { isValidProjectName } from "./scaffold.js";

export interface WizardSelection {
  readonly targetDir: string | undefined;
  readonly runtimeId: string;
  readonly pluginIds: readonly string[];
}

// The wizard only ever chooses string ids (runtimes, plugins), so the
// prompter is string-typed rather than generic — which also sidesteps
// @clack/prompts' conditional Option typing.
interface Choice {
  readonly value: string;
  readonly label: string;
  readonly hint?: string;
}

/**
 * The prompt surface the wizard needs, abstracted from @clack/prompts so
 * the flow (which fields to ask, how answers merge) is testable without a
 * TTY. A method returns `null` when the user cancels.
 */
export interface Prompter {
  text(opts: {
    message: string;
    placeholder?: string;
    validate?: (value: string) => string | undefined;
  }): Promise<string | null>;
  select(opts: {
    message: string;
    options: readonly Choice[];
    initialValue?: string;
  }): Promise<string | null>;
  multiselect(opts: {
    message: string;
    options: readonly Choice[];
    initialValues?: readonly string[];
    required?: boolean;
  }): Promise<string[] | null>;
}

/**
 * Ask for exactly the fields in `prompts` (the plan the reconciler
 * produced), leaving flagged values untouched. Returns the completed
 * selection, or `null` if the user cancelled any step.
 */
export async function runWizard(
  prompts: readonly PromptKey[],
  flagged: WizardSelection,
  registry: Registry,
  prompter: Prompter,
): Promise<WizardSelection | null> {
  let { targetDir, runtimeId, pluginIds } = flagged;

  if (prompts.includes("targetDir")) {
    const value = await prompter.text({
      message: "Where should we create your project?",
      placeholder: "my-plumix-site",
      validate: (input) =>
        isValidProjectName(basename(input))
          ? undefined
          : "Use lowercase letters, digits, and - _ . (no spaces).",
    });
    if (value === null) return null;
    targetDir = value;
  }

  if (prompts.includes("runtime")) {
    const value = await prompter.select({
      message: "Which runtime?",
      options: registry.runtimes.map((runtime) => ({
        value: runtime.id,
        label: runtime.label,
        hint: runtime.description,
      })),
      initialValue: runtimeId,
    });
    if (value === null) return null;
    runtimeId = value;
  }

  if (prompts.includes("plugins")) {
    const value = await prompter.multiselect({
      message: "Which plugins?",
      options: registry.plugins.map((plugin) => ({
        value: plugin.id,
        label: plugin.label,
        hint: plugin.description,
      })),
      initialValues: [...pluginIds],
      required: false,
    });
    if (value === null) return null;
    pluginIds = value;
  }

  return { targetDir, runtimeId, pluginIds };
}

/** Production {@link Prompter}, backed by @clack/prompts. */
export const clackPrompter: Prompter = {
  async text(opts) {
    const { validate } = opts;
    const value = await clack.text({
      message: opts.message,
      placeholder: opts.placeholder,
      validate: validate ? (input) => validate(input ?? "") : undefined,
    });
    return clack.isCancel(value) ? null : value;
  },
  async select(opts) {
    const value = await clack.select({
      message: opts.message,
      options: [...opts.options],
      initialValue: opts.initialValue,
    });
    return clack.isCancel(value) ? null : value;
  },
  async multiselect(opts) {
    const value = await clack.multiselect({
      message: opts.message,
      options: [...opts.options],
      initialValues: opts.initialValues ? [...opts.initialValues] : undefined,
      required: opts.required ?? false,
    });
    return clack.isCancel(value) ? null : value;
  },
};
