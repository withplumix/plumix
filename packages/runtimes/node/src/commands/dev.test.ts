import { EvaluatedModules } from "vite/module-runner";
import { describe, expect, test } from "vitest";

import { invalidateFile, parseDevArgs } from "./dev.js";

describe("parseDevArgs", () => {
  test("extracts --port in both forms", () => {
    expect(parseDevArgs(["--port", "3030"])).toEqual({ port: 3030 });
    expect(parseDevArgs(["--port=3030"])).toEqual({ port: 3030 });
  });

  test("returns an empty object when neither flag is given (vite defaults)", () => {
    expect(parseDevArgs([])).toEqual({});
    expect(parseDevArgs(["--verbose"])).toEqual({});
  });

  test("rejects a --port that is not a port", () => {
    expect(() => parseDevArgs(["--port", "abc"])).toThrow(
      /--port.*must be a number/i,
    );
    expect(() => parseDevArgs(["--port="])).toThrow(
      /--port.*must be a number/i,
    );
    expect(() => parseDevArgs(["--port", "70000"])).toThrow(
      /--port.*must be a number/i,
    );
    expect(() => parseDevArgs(["--port"])).toThrow(/--port.*requires a value/i);
  });

  test("extracts --host with a value in both forms", () => {
    expect(parseDevArgs(["--host", "0.0.0.0"])).toEqual({ host: "0.0.0.0" });
    expect(parseDevArgs(["--host=0.0.0.0"])).toEqual({ host: "0.0.0.0" });
  });

  test("rejects an empty --host=, which would bind every interface silently", () => {
    expect(() => parseDevArgs(["--host="])).toThrow(
      /--host=.*requires a value/i,
    );
  });

  test("a bare --host means every interface, as it does for vite", () => {
    expect(parseDevArgs(["--host"])).toEqual({ host: true });
    expect(parseDevArgs(["--host", "--port", "3030"])).toEqual({
      host: true,
      port: 3030,
    });
  });

  test("parses --port and --host together in either order", () => {
    expect(parseDevArgs(["--port", "3020", "--host", "127.0.0.1"])).toEqual({
      port: 3020,
      host: "127.0.0.1",
    });
    expect(parseDevArgs(["--host", "127.0.0.1", "--port", "3020"])).toEqual({
      port: 3020,
      host: "127.0.0.1",
    });
  });
});

describe("invalidateFile — the runner's evaluated-module cache", () => {
  // entry → config → theme; `other` is imported by nothing under test.
  function graph() {
    const modules = new EvaluatedModules();
    const entry = modules.ensureModule("/app/.plumix/worker.ts", "/x");
    const config = modules.ensureModule("/app/plumix.config.ts", "/y");
    const theme = modules.ensureModule("/app/theme.ts", "/z");
    const other = modules.ensureModule("/app/other.ts", "/w");
    entry.imports.add(config.id);
    config.importers.add(entry.id);
    config.imports.add(theme.id);
    theme.importers.add(config.id);
    for (const node of [entry, config, theme, other]) {
      node.evaluated = true;
      node.exports = {};
      node.meta = {
        code: "",
        id: node.id,
        url: node.url,
        file: node.file,
        invalidate: false,
      };
    }
    return { modules, entry, config, theme, other };
  }

  test("invalidates the changed file and every module that imports it, up to the entry", () => {
    const { modules, entry, config, theme, other } = graph();

    expect(invalidateFile(modules, "/app/theme.ts")).toBe(true);

    for (const node of [theme, config, entry]) {
      expect(node.evaluated, node.id).toBe(false);
      expect(node.meta, node.id).toBeUndefined();
      expect(node.exports, node.id).toBeUndefined();
    }
    expect(other.evaluated).toBe(true);
  });

  test("reports a file the runner never evaluated, so the app is not rebuilt for it", () => {
    const { modules, entry } = graph();

    expect(invalidateFile(modules, "/app/unrelated.css")).toBe(false);
    expect(entry.evaluated).toBe(true);
  });

  test("terminates on an import cycle", () => {
    const { modules, entry, config } = graph();
    entry.importers.add(config.id);
    config.imports.add(entry.id);

    expect(invalidateFile(modules, "/app/plumix.config.ts")).toBe(true);
    expect(entry.evaluated).toBe(false);
  });
});
