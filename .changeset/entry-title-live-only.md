---
"@plumix/core": patch
---

Treat the entry title as a live-only field on every read and write path.

#1544 made the `?preview=` render read the live title, but three other paths
still read the frozen autosave/revision snapshot, so the title diverged
depending on where it was read:

- `entry.publish` promoted the autosave's snapshot title onto the live row. A
  title edited on live after a content draft was written reverted to the stale
  snapshot on publish. Publish now leaves the live title untouched.
- `entry.get` preview overlaid the snapshot title, so the editor form and the
  public preview could disagree. It now keeps the live title.
- `entry.update`'s draft branch stored a caller-supplied title on the autosave
  row. It now anchors the snapshot column to the live title and ignores a
  drafted title (drafting a title independently of publishing is no longer a
  capability — the editor writes title straight to live with `saveAs: "live"`).
- Restoring a revision onto an autosave-supporting type wrote the revision's
  title into the draft, where nothing read it back. It now anchors title to
  the live row, exactly like slug and parentId already do; only content,
  excerpt, and meta restore into the draft.
