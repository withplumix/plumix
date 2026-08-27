---
"@plumix/plugin-og": minor
"@plumix/core": minor
---

An author can see what a post will look like when it is shared, before publishing it. Name the entry
types that should carry it — `og({ preview: ["post", "page"] })` — and each one's editor gains a
**Social card** box: the image the entry will actually be shared with, a line naming which of the
four links of the `og:image` chain produced it, and — where no card was generated — the reason, in
the same vocabulary the debug bar's og panel reads. "I set a featured image and the preview did not
change" now reads back as _The card steps aside for the featured image_.

The preview renders on request and reads nothing back from storage, so a draft has one too — which
is the point, since a card's URL is addressed by a digest over what the card read, and a draft has
no stable one while an entry under edit moves out from under it. It overlays the caller's pending
autosave the way `entry.get`'s preview mode does, because on an entry type supporting autosave a
_published_ entry's meta edits land on a per-user draft row — so a featured image picked on a live
post shows up here before it is published. The bytes travel back inline from a plugin procedure
gated on the entry's own edit capability; with a `remote()` renderer connected the card's content
also reaches that endpoint, which is the operator's own service.

An entry no scraper could reach — a private type, or one an access policy gates — gets no card in
the preview either. Only the _status_ half of that check is skipped, since showing a draft is the
point; skipping the rest would name a link the page will never use.

It previews; it does not choose. There is no per-entry override, no template picker and no mode
select: the chain is the one precedence authority, and adding a fifth control before authors can
see the outcome is backwards. When per-entry control does arrive it has to become that authority
rather than sit beside it.

The list of entry types is not defaulted. A meta box is registered against entry types by name and
a name nothing registered fails the boot, so a guess here would crash a site for installing a
plugin; left out, neither the box, the procedure behind it, nor the plugin's admin chunk is
registered.

Core exports three helpers this needs, each the seam core itself reads through: `entryRoleImage`
(the role links of the same chain, so a subscriber that has to say where an image came from is not
re-deriving them and matching URLs against the result), `loadSiteSettings` (the request-memoized
`site` bag, so asking for one setting joins the read the head defaults already made), and
`getAutosave` (the caller's pending draft of an entry).
