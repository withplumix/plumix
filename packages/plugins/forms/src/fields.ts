// The field builders this plugin adds to the ones `plumix/fields`
// already ships. Imported via `@plumix/plugin-forms/fields` so `tel`
// sits beside `text` / `email` in a form's field list.

import { StringFieldBuilder } from "plumix/fields";

import { TEL_INPUT_TYPE } from "./contract.js";

/**
 * Telephone input — `tel("phone")`. Not one of core's built-in string
 * scalars: the plugin contributes it through `registerFieldType`, and the
 * chain is core's own string builder over the contributed `inputType`, so
 * `tel` reads, stores and conditions exactly as `text` does.
 *
 * A browser shows the numeric keypad for it and, deliberately, validates
 * nothing — phone numbers have no format worth enforcing across borders.
 */
export function tel<K extends string>(
  key: K,
): StringFieldBuilder<typeof TEL_INPUT_TYPE, K> {
  return new StringFieldBuilder(TEL_INPUT_TYPE, key);
}
