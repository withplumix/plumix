import type { ReactElement } from "react";
import { useMemo } from "react";
import { defineMessage } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { countProse } from "@plumix/blocks";

import { usePuckSelector } from "./puck-hooks.js";
import { puckDataToBlockTree } from "./puck-to-block-tree.js";

const M = {
  words: defineMessage({
    id: "editor.layout.wordCount",
    message: "{words, plural, one {# word} other {# words}}",
    comment: "words: number of words in the entry's prose blocks",
  }),
  characters: defineMessage({
    id: "editor.layout.characterCount",
    message: "{characters, plural, one {# character} other {# characters}}",
    comment: "characters: number of characters in the entry's prose blocks",
  }),
};

// Pure presentational half — unit-testable without a Puck store. Shows
// the word figure; the character total rides the accessible name and a
// `title` tooltip so the visible chrome stays one compact number.
export function WordCountView({
  words,
  characters,
}: {
  readonly words: number;
  readonly characters: number;
}): ReactElement {
  const { i18n } = useLingui();
  const wordsLabel = i18n._(
    M.words.id,
    { words },
    { message: M.words.message },
  );
  const charactersLabel = i18n._(
    M.characters.id,
    { characters },
    { message: M.characters.message },
  );
  return (
    <span
      data-testid="plumix-editor-word-count"
      data-words={words}
      data-characters={characters}
      title={charactersLabel}
      aria-label={`${wordsLabel}, ${charactersLabel}`}
      className="text-muted-foreground hidden shrink-0 text-xs tabular-nums sm:inline"
    >
      {wordsLabel}
    </span>
  );
}

// Passive word/character readout. Reads live Puck data (re-renders on
// every content change) and counts only prose blocks via the shared
// `countProse`.
export function WordCount(): ReactElement {
  const data = usePuckSelector((s) => s.appState.data);
  const { words, characters } = useMemo(
    () => countProse(puckDataToBlockTree(data)),
    [data],
  );
  return <WordCountView words={words} characters={characters} />;
}
