import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";

import { maxEffects } from "./max-effects.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const effect = (callee: string): string => `${callee}(() => {}, []);\n`;

new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
}).run("plumix/max-effects", maxEffects, {
  valid: [
    { code: "const value = useMemo(() => 1, []);", options: [{ max: 0 }] },
    {
      code: `${effect("useEffectEvent")}${effect("useMyEffect")}${effect("effects.useEffect.run")}`,
      options: [{ max: 0 }],
    },
    { code: effect("useEffect").repeat(2), options: [{ max: 2 }] },
    {
      code: "export const Box = () => <div />;\nuseEffect(() => {}, []);",
      options: [{ max: 1 }],
    },
  ],
  invalid: [
    {
      code: effect("useEffect"),
      options: [{ max: 0 }],
      errors: [
        {
          messageId: "tooManyEffects",
          data: { count: "1", max: "0" },
          line: 1,
        },
      ],
    },
    {
      code: `${effect("useEffect")}${effect("React.useEffect")}${effect("useLayoutEffect")}${effect("React.useLayoutEffect")}${effect("useInsertionEffect")}`,
      options: [{ max: 4 }],
      errors: [{ messageId: "tooManyEffects", data: { count: "5", max: "4" } }],
    },
    {
      code: effect("useEffect").repeat(3),
      options: [{ max: 1 }],
      errors: [
        {
          messageId: "tooManyEffects",
          data: { count: "3", max: "1" },
          line: 2,
        },
      ],
    },
  ],
});
