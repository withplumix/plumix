---
"plumix": minor
---

Localizes the labels `plumix/admin/ui` primitives used to render in English, and makes them required props. `DialogContent`, `SheetContent` and `CommandDialog` take `closeLabel` whenever their close button shows, and `DialogFooter` takes it with `showCloseButton`. `Sidebar` takes `mobileTitle` and `mobileDescription`. `SidebarTrigger`, `SidebarRail`, `Breadcrumb`, `BreadcrumbEllipsis`, `Pagination`, `PaginationPrevious`, `PaginationNext` and `PaginationEllipsis` take `label`. `CommandDialog`'s `title` and `description` lose their English defaults. Pass each one a translated string. Removes `SidebarMenuSkeleton`. `useIsMobile` now reports the viewport on the first render instead of `false` until an effect runs.
