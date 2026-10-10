// The field builders this plugin adds to the ones `plumix/fields`
// already ships. Imported via `@plumix/plugin-forms/fields` so `tel`
// sits beside `text` / `email` in a form's field list.

import { StringFieldBuilder } from "plumix/fields";

import { TEL_INPUT_TYPE } from "./contract.js";

/**
 * Behaves exactly like `text`, and deliberately validates nothing: phone
 * numbers have no format worth enforcing across borders.
 */
export function tel<K extends string>(
  key: K,
): StringFieldBuilder<typeof TEL_INPUT_TYPE, K> {
  return new StringFieldBuilder(TEL_INPUT_TYPE, key);
}
