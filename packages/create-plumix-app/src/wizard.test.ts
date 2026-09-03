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
  secretsFile: ".dev.vars",
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

interface FakePrompter extends Prompter {
  readonly calls: string[];
  /** The values each multiselect was opened preticked with, in call order. */
  readonly preticked: (readonly string[] | undefined)[];
}

function fakePrompter(answers: ScriptedAnswers): FakePrompter {
  const calls: string[] = [];
  const preticked: (readonly string[] | undefined)[] = [];
  const multiselects = [...(answers.multiselect ?? [])];
  return {
    calls,
    preticked,
    text: () => {
      calls.push("text");
      return Promise.resolve(answers.text ?? null);
    },
    select: () => {
      calls.push("select");
      return Promise.resolve(answers.select ?? null);
    },
    multiselect: (opts) => {
      calls.push("multiselect");
      preticked.push(opts.initialValues);
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

  it("opens the plugin prompt preticked with the ids it was handed", async () => {
    const prompter = fakePrompter({ multiselect: [["blog"], []] });

    await runWizard(
      ["plugins"],
      { ...defaults, pluginIds: ["blog"] },
      registry,
      prompter,
    );

    expect(prompter.preticked[0]).toEqual(["blog"]);
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
