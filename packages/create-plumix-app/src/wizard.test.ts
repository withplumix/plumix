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
  multiselect?: string[] | null;
}

function fakePrompter(
  answers: ScriptedAnswers,
): Prompter & { calls: string[] } {
  const calls: string[] = [];
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
      return Promise.resolve(answers.multiselect ?? null);
    },
  };
}

const defaults: WizardSelection = {
  targetDir: undefined,
  runtimeId: "cloudflare",
  pluginIds: [],
};

describe("runWizard", () => {
  it("prompts for every field in the plan, in order", async () => {
    const prompter = fakePrompter({
      text: "my-app",
      select: "cloudflare",
      multiselect: ["blog"],
    });

    const result = await runWizard(
      ["targetDir", "runtime", "plugins"],
      defaults,
      registry,
      prompter,
    );

    expect(prompter.calls).toEqual(["text", "select", "multiselect"]);
    expect(result).toEqual({
      targetDir: "my-app",
      runtimeId: "cloudflare",
      pluginIds: ["blog"],
    });
  });

  it("only prompts for fields in the plan, keeping flagged values", async () => {
    const prompter = fakePrompter({ select: "cloudflare" });

    const result = await runWizard(
      ["runtime"],
      { targetDir: "given", runtimeId: "cloudflare", pluginIds: ["blog"] },
      registry,
      prompter,
    );

    expect(prompter.calls).toEqual(["select"]);
    expect(result).toEqual({
      targetDir: "given",
      runtimeId: "cloudflare",
      pluginIds: ["blog"],
    });
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
    // cancelled at select — multiselect is never reached
    expect(prompter.calls).toEqual(["text", "select"]);
  });

  it("treats an empty multiselect as no plugins", async () => {
    const prompter = fakePrompter({ multiselect: [] });

    const result = await runWizard(["plugins"], defaults, registry, prompter);

    expect(result?.pluginIds).toEqual([]);
  });
});
