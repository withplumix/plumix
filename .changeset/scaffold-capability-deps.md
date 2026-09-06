---
"create-plumix-app": minor
---

A runtime capability may now name dependencies (`deps`) that are added to the project only when a selected plugin requires that capability, which is how the Node runtime's `imageDelivery` installs `sharp` for the media plugin without every Node project paying for it.
