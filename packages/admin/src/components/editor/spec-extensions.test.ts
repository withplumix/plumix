import { Mark, Node } from "@tiptap/core";
import { describe, expect, test, vi } from "vitest";

import type { ResolvedBlockSpec, ResolvedMarkSpec } from "@plumix/blocks";

import {
  wireBlockSpecExtension,
  wireMarkSpecExtension,
} from "./spec-extensions.js";

function probeSpec(opts: {
  keyboardShortcuts?: readonly {
    shortcut: string;
    attrs?: Record<string, unknown>;
    mode?: "setNode" | "wrap" | "leaf";
  }[];
  markdownShortcuts?: readonly {
    pattern: string;
    attrs?: Record<string, unknown>;
    mode?: "setNode" | "wrap" | "leaf";
  }[];
  parsePaste?: readonly { selector: string }[];
}): ResolvedBlockSpec {
  const schema = Node.create({
    name: "core/probe",
    group: "block",
    content: "inline*",
    parseHTML() {
      return [{ tag: "div[data-probe]" }];
    },
    renderHTML() {
      return ["div", { "data-probe": "" }, 0];
    },
  });
  const spec: Partial<ResolvedBlockSpec> = {
    name: "core/probe",
    title: "Probe",
    category: "typography",
    schema,
    registeredBy: null,
    keyboardShortcuts: opts.keyboardShortcuts,
    markdownShortcuts: opts.markdownShortcuts,
    parsePaste: opts.parsePaste,
  };
  return spec as ResolvedBlockSpec;
}

describe("wireBlockSpecExtension — markdownShortcut", () => {
  test("declares no input rules when markdownShortcut is empty", () => {
    const spec = probeSpec({});
    const wired = wireBlockSpecExtension(spec);
    expect(wired).toBe(spec.schema);
  });

  test("attaches one input rule per declared pattern, anchored to the start", () => {
    const spec = probeSpec({
      markdownShortcuts: [{ pattern: "# " }, { pattern: "## " }],
    });
    const wired = wireBlockSpecExtension(spec);
    const fakeNodeType = { name: "core/probe" };
    // addInputRules looks up the node by name on the editor schema,
    // so the stubbed editor must expose the matching nodes map.
    const fakeEditor = { schema: { nodes: { "core/probe": fakeNodeType } } };
    const rules =
      wired.config.addInputRules?.call({ editor: fakeEditor } as never) ?? [];
    expect(rules).toHaveLength(2);
    expect((rules[0]?.find as RegExp | undefined)?.source).toBe("^# $");
    expect((rules[1]?.find as RegExp | undefined)?.source).toBe("^## $");
  });
});

describe("wireBlockSpecExtension — parsePaste", () => {
  test("merges declared selectors with the base schema's parseHTML rules", () => {
    const spec = probeSpec({ parsePaste: [{ selector: "h1" }] });
    const wired = wireBlockSpecExtension(spec);
    // Tiptap's `this.parent?.()` returns the inherited node's
    // parseHTML output. Stub it to return the base rule so the test
    // verifies the merge semantics, not the Tiptap internals.
    const ctx = { parent: () => [{ tag: "div[data-probe]" }] };
    const rules = wired.config.parseHTML?.call(ctx as never) ?? [];
    const tags = rules.map((r) => (r as { tag?: string }).tag);
    expect(tags).toContain("h1");
    expect(tags).toContain("div[data-probe]");
  });
});

describe("wireBlockSpecExtension — keyboardShortcut", () => {
  test("returns the original schema unchanged when no shortcut declared", () => {
    const spec = probeSpec({});
    const wired = wireBlockSpecExtension(spec);
    expect(wired).toBe(spec.schema);
  });

  test("extends the schema with addKeyboardShortcuts binding the declared key to setNode", () => {
    const spec = probeSpec({
      keyboardShortcuts: [{ shortcut: "Mod-Alt-p" }],
    });
    const wired = wireBlockSpecExtension(spec);
    // The wired Node's config exposes `addKeyboardShortcuts` — invoking
    // it returns the shortcut map. The bound command runs against a
    // chain mock to assert the resulting Tiptap call.
    const setNode = vi.fn();
    const chain = {
      focus: () => chain,
      setNode: (name: string, attrs?: Record<string, unknown>) => {
        setNode(name, attrs);
        return chain;
      },
      run: () => true,
    };
    const fakeEditor = { chain: () => chain };
    const shortcuts =
      wired.config.addKeyboardShortcuts?.call({
        editor: fakeEditor,
      } as never) ?? {};
    expect(Object.keys(shortcuts)).toContain("Mod-Alt-p");
    (shortcuts as Record<string, () => boolean>)["Mod-Alt-p"]?.();
    expect(setNode).toHaveBeenCalledWith("core/probe", undefined);
  });

  test("mode: 'wrap' calls wrapIn instead of setNode", () => {
    const spec = probeSpec({
      keyboardShortcuts: [{ shortcut: "Mod-Alt-w", mode: "wrap" }],
    });
    const wired = wireBlockSpecExtension(spec);
    const wrapIn = vi.fn();
    const setNode = vi.fn();
    const chain = {
      focus: () => chain,
      wrapIn: (name: string, attrs?: Record<string, unknown>) => {
        wrapIn(name, attrs);
        return chain;
      },
      setNode: (name: string, attrs?: Record<string, unknown>) => {
        setNode(name, attrs);
        return chain;
      },
      insertContent: () => chain,
      run: () => true,
    };
    const shortcuts = (wired.config.addKeyboardShortcuts?.call({
      editor: { chain: () => chain },
    } as never) ?? {}) as Record<string, () => boolean>;
    shortcuts["Mod-Alt-w"]?.();
    expect(wrapIn).toHaveBeenCalledWith("core/probe", undefined);
    expect(setNode).not.toHaveBeenCalled();
  });

  test("mode: 'leaf' calls insertContent with a node descriptor", () => {
    const spec = probeSpec({
      keyboardShortcuts: [{ shortcut: "Mod-Alt-h", mode: "leaf" }],
    });
    const wired = wireBlockSpecExtension(spec);
    const insertContent = vi.fn();
    const chain = {
      focus: () => chain,
      wrapIn: () => chain,
      setNode: () => chain,
      insertContent: (content: unknown) => {
        insertContent(content);
        return chain;
      },
      run: () => true,
    };
    const shortcuts = (wired.config.addKeyboardShortcuts?.call({
      editor: { chain: () => chain },
    } as never) ?? {}) as Record<string, () => boolean>;
    shortcuts["Mod-Alt-h"]?.();
    expect(insertContent).toHaveBeenCalledWith({
      type: "core/probe",
      attrs: undefined,
    });
  });

  test("multi-shortcut entries pass attrs through to setNode", () => {
    const spec = probeSpec({
      keyboardShortcuts: [
        { shortcut: "Mod-Alt-1", attrs: { level: 1 } },
        { shortcut: "Mod-Alt-2", attrs: { level: 2 } },
      ],
    });
    const wired = wireBlockSpecExtension(spec);
    const setNode = vi.fn();
    const chain = {
      focus: () => chain,
      setNode: (name: string, attrs: Record<string, unknown> | undefined) => {
        setNode(name, attrs);
        return chain;
      },
      run: () => true,
    };
    const fakeEditor = { chain: () => chain };
    const shortcuts = (wired.config.addKeyboardShortcuts?.call({
      editor: fakeEditor,
    } as never) ?? {}) as Record<string, () => boolean>;
    shortcuts["Mod-Alt-1"]?.();
    shortcuts["Mod-Alt-2"]?.();
    expect(setNode).toHaveBeenCalledWith("core/probe", { level: 1 });
    expect(setNode).toHaveBeenCalledWith("core/probe", { level: 2 });
  });
});

function markProbeSpec(opts: {
  keyboardShortcut?: string;
  parsePaste?: readonly { selector: string }[];
}): ResolvedMarkSpec {
  const spec: Partial<ResolvedMarkSpec> = {
    name: "core/probe-mark",
    title: "Probe mark",
    schema: Mark.create({ name: "core/probe-mark" }),
    registeredBy: null,
    keyboardShortcut: opts.keyboardShortcut,
    parsePaste: opts.parsePaste,
    component: () => null,
  };
  return spec as ResolvedMarkSpec;
}

describe("wireMarkSpecExtension", () => {
  test("returns the base mark when no editor-side fields are set", () => {
    const spec = markProbeSpec({});
    const wired = wireMarkSpecExtension(spec);
    expect(wired).toBe(spec.schema);
  });

  test("binds keyboardShortcut to toggleMark on the registered name", () => {
    const spec = markProbeSpec({ keyboardShortcut: "Mod-Alt-w" });
    const wired = wireMarkSpecExtension(spec);
    const toggleMark = vi.fn();
    const chain = {
      focus: () => chain,
      toggleMark: (name: string) => {
        toggleMark(name);
        return chain;
      },
      run: () => true,
    };
    const shortcuts = (wired.config.addKeyboardShortcuts?.call({
      editor: { chain: () => chain },
    } as never) ?? {}) as Record<string, () => boolean>;
    shortcuts["Mod-Alt-w"]?.();
    expect(toggleMark).toHaveBeenCalledWith("core/probe-mark");
  });

  test("attaches parsePaste rules into the mark's parseHTML output", () => {
    const spec = markProbeSpec({
      parsePaste: [{ selector: "span.warn" }, { selector: "em.warn" }],
    });
    const wired = wireMarkSpecExtension(spec);
    const rules = (wired.config.parseHTML?.call({
      parent: undefined,
    } as never) ?? []) as readonly { tag: string }[];
    const selectors = rules.map((r) => r.tag);
    expect(selectors).toContain("span.warn");
    expect(selectors).toContain("em.warn");
  });
});
