---
"@plumix/plugin-menu": patch
---

Fixes the `menu_item` entry type and the `menu` taxonomy inheriting core's default capabilities. Every capability of both now goes to editors, the tier `term:menu:manage` already sets, so core's entry and term procedures read and write menus only for editors and admins.
