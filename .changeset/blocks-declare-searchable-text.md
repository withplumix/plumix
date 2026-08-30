---
"@plumix/blocks": minor
"@plumix/plugin-media": minor
"plumix": minor
---

Blocks now declare which of their inputs carry text and whether each holds HTML, and one walk extracts an entry's plain text from that roster — nested slots included, tags stripped, entities decoded. `extractBlockText` returns the text; `blockTextVersion` hashes the merged roster, so a block that adds or changes a declaration invalidates whatever was derived from the old one without an author maintaining a version number.

`countProse` is now a filter over the same walk and takes the roster as a second argument: `countProse(blocks, blockTextRoster(coreBlocks))`. It keeps reading only the inputs declared as body copy, so reading-length estimates are unchanged — a code listing, a control's label, an image's alt text and a caption are findable but are not read at prose speed.
