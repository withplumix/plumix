import { describe, expect, it } from "vitest";

import type { PluginDescriptor, RuntimeDescriptor } from "./compose/types.js";
import type { Registry } from "./registry.js";
import type { Prompter, WizardSelection } from "./wizard.js";
import { runWizard } from "./wizard.js";

const cloudflare: RuntimeDescriptor = {
  id: "cloudflare",
  label: "Cloudflare",
  imports: [],
  configSlots: {},
  deps: {},
  devDeps: {},
  files: {},
};

const blog: PluginDescriptor = {
  id: "blog",
  label: "Blog",
  registration: "blog",
  imports: [],
  deps: {},
};

const registry: Registry = { runtimes: [cloudflare], plugins: [blog] };

interface ScriptedAnswers {
  text?: string | null;
  select?: string | null;
  // Consumed in order: the plugins multiselect, then the auth multiselect.
  multiselect?: (string[] | null)[];
}

function fakePrompter(
  answers: ScriptedAnswers,
): Prompter & { calls: string[] } {
  const calls: string[] = [];
  const multiselects = [...(answers.multiselect ?? [])];
  return {
    calls,
    text: () => {
      calls.push("text");
      return Promise.resolve(answers.text ?? null);
    },
    select: () => {
      calls.push("select");
      return Promise.resolve(answers.select ?? null);
    },
    multiselect: () => {
      calls.push("multiselect");
      return Promise.resolve(multiselects.shift() ?? []);
    },
  };
}

const defaults: WizardSelection = {
  targetDir: undefined,
  runtimeId: "cloudflare",
  pluginIds: [],
  authMethodIds: [],
};

describe("runWizard", () => {
  it("prompts for the plan fields then auth, in order", async () => {
    const prompter = fakePrompter({
      text: "my-app",
      select: "cloudflare",
      multiselect: [["blog"], ["oauth"]],
    });

    const result = await runWizard(
      ["targetDir", "runtime", "plugins"],
      defaults,
      registry,
      prompter,
    );

    expect(prompter.calls).toEqual([
      "text",
      "select",
      "multiselect",
      "multiselect",
    ]);
    expect(result).toEqual({
      targetDir: "my-app",
      runtimeId: "cloudflare",
      pluginIds: ["blog"],
      authMethodIds: ["oauth"],
    });
  });

  it("only prompts for plan fields, but always offers auth", async () => {
    const prompter = fakePrompter({ select: "cloudflare", multiselect: [[]] });

    const result = await runWizard(
      ["runtime"],
      {
        targetDir: "given",
        runtimeId: "cloudflare",
        pluginIds: ["blog"],
        authMethodIds: [],
      },
      registry,
      prompter,
    );

    // runtime select + auth multiselect (plugins were flagged, so skipped)
    expect(prompter.calls).toEqual(["select", "multiselect"]);
    expect(result).toMatchObject({ targetDir: "given", pluginIds: ["blog"] });
  });

  it("returns null when a prompt is cancelled", async () => {
    const prompter = fakePrompter({ text: "my-app", select: null });

    const result = await runWizard(
      ["targetDir", "runtime", "plugins"],
      defaults,
      registry,
      prompter,
    );

    expect(result).toBeNull();
    expect(prompter.calls).toEqual(["text", "select"]);
  });

  it("records selected auth methods", async () => {
    const prompter = fakePrompter({ multiselect: [["magic-link"]] });

    const result = await runWizard([], defaults, registry, prompter);

    expect(result?.authMethodIds).toEqual(["magic-link"]);
  });
});
