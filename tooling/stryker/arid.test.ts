import type { NodePath } from "@babel/traverse";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import { expect, test } from "vitest";

import { aridReason } from "./arid.ts";

/** The source text of every outermost node the rules leave unmutated. */
function ignored(source: string): string[] {
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });
  const found: string[] = [];
  traverse(ast, {
    enter(path: NodePath) {
      if (aridReason(path) === undefined) return;
      found.push(source.slice(path.node.start ?? 0, path.node.end ?? 0));
      path.skip();
    },
  });
  return found;
}

const inFunction = (body: string): string =>
  `export function f(ctx, x) {\n  ${body}\n}\n`;

test("a log call, and the statement that makes it, are left alone", () => {
  expect(
    ignored(
      inFunction('ctx.logger.warn("magic_link_verify_rejected", { code: x });'),
    ),
  ).toEqual(['ctx.logger.warn("magic_link_verify_rejected", { code: x });']);
});

test("a call that only shares a log method's name is mutated", () => {
  expect(ignored(inFunction("return Math.log(x) + catalog.error(x);"))).toEqual(
    [],
  );
});

test("an error's message and details are left alone, its code is mutated", () => {
  expect(
    ignored(
      inFunction(
        'throw new AppBootError("name_reserved", `Plugin ${x} is taken`, { pluginId: x });',
      ),
    ),
  ).toEqual(["`Plugin ${x} is taken`", "{ pluginId: x }"]);
});

test('an empty `?? ""` fallback is left alone, a real default is mutated', () => {
  expect(ignored(inFunction('return [x[0] ?? "", x[1] ?? "none"];'))).toEqual([
    '""',
  ]);
});

test("a label or description a person reads is left alone, a name is mutated", () => {
  expect(
    ignored(
      inFunction(
        'return { name: "invite", label: "Invite", description: `Sign in ${x}` };',
      ),
    ),
  ).toEqual(['"Invite"', "`Sign in ${x}`"]);
});

test("the debug hint a missing page carries is left alone", () => {
  expect(
    ignored(
      inFunction(
        'if (x === null) return { missing: "public-custom-archive-not-found" };',
      ),
    ),
  ).toEqual(['"public-custom-archive-not-found"']);
});

test("spreading a key only when it is defined: the test is left alone, dropping the key is mutated", () => {
  expect(
    ignored(
      inFunction(
        "return { ...(x.access === undefined ? {} : { access: x.access }) };",
      ),
    ),
  ).toEqual(["x.access === undefined"]);
});

test("code that runs when the module loads is left alone, a function declared there is mutated", () => {
  expect(
    ignored(
      'const CODES = new Set(["email_unverified"]);\nexport const isCode = (x) => CODES.has(x) && x !== "";\n',
    ),
  ).toEqual(['const CODES = new Set(["email_unverified"]);', "isCode"]);
});
