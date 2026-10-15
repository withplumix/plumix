import { useState } from "react";

import type { TokenCategory } from "@plumix/core/blocks";

import type {
  StyleFieldMode,
  StyleFieldState,
  StyleFieldStateOptions,
} from "./style-field-state.js";
import { styleFieldState } from "./style-field-state.js";
import { useStyleFields } from "./style-fields-context.js";

export interface UseStyleFieldOptions extends Omit<
  StyleFieldStateOptions,
  "onPreferredModeChange"
> {
  /** Fix the token scale to this category instead of deriving it from the
   *  property — for a control owned by a section (e.g. a color picker). */
  readonly category?: TokenCategory;
}

export function useStyleField(
  property: string,
  value: string | undefined,
  { category, ...options }: UseStyleFieldOptions,
): StyleFieldState {
  const field = useStyleFields().field(property, { category });
  const [preferredMode, setPreferredMode] = useState<StyleFieldMode>();
  return styleFieldState(field, value, preferredMode, {
    ...options,
    onPreferredModeChange: setPreferredMode,
  });
}
