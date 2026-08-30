---
"@plumix/admin-editor": minor
---

Adds a command palette scoped to editor actions, opened with Cmd/Ctrl+K inside the editor. It
offers the actions the toolbars already carry — group, ungroup, x-ray, the three device switches —
plus two the editor had no keyboard route to at all: inserting any block from the catalog, and
jumping to a block by name. Escape closes it, the chord toggles it, and both work with focus on the
shell or inside the canvas iframe.

This is the editor's own palette, not the admin shell's. The shell's registered commands are handed
a router and nothing else, so one could never reach the selection, the store, or the canvas camera;
widening that context would have coupled the shell's registry to editor internals and made every
existing command's `run` partial. The two never compete for the chord: the editor routes are a
sibling layout of the admin shell's, so the shell palette is not mounted while the editor is.

Jumping to a block selects it and brings the canvas to it, panning at whatever zoom the author was
working at rather than framing the block — a jump to a button or a spacer should not turn into a
close-up. Inserting from the palette appends at the top level and reveals the new block the same
way, since an insert with no drop position can otherwise land off-screen. Group and ungroup are
left out of the list when the selection cannot take them, rather than offered and then doing
nothing.

Unlike the cheatsheet's `?`, Cmd+K carries no typing guard: it types nothing, so it still opens the
palette from the title field or a rich-text body. `@plumix/admin` gains the matching wiring — the
revisions sheet is now controlled, so the palette can open it without its header trigger being
clicked, and the command is offered only for an entry type that keeps revisions.
