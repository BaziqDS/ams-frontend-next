# DASHBOARD SURFACE KNOWLEDGE BASE

## OVERVIEW
Authenticated admin surface. Large page-local state, shared topbar/sidebar shell, direct backend API integration via `apiFetch`.

## STRUCTURE
```text
src/app/(dashboard)/
├── layout.tsx   # auth-gated shell + sidebar/main-col
├── users/       # user management page
└── roles/       # role management page
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Auth gating | `layout.tsx` | redirects unauthenticated users |
| User admin UI | `users/page.tsx` | source-of-truth pattern for admin list pages |
| Role admin UI | `roles/page.tsx` | mirrors users page, includes CSV export |
| Shared chrome | `@/components/Topbar`, `@/components/AppSidebar` | shell/layout consistency |
| API helper | `@/lib/api` | only backend request helper used here |

## CONVENTIONS
- Pages in this subtree are client components with large local state; that is normal here.
- `users/page.tsx` is the design/template reference for admin surface parity.
- Filter bar + table/grid controls + page head patterns should stay consistent across admin pages.
- Use `@/` imports consistently; path alias is standard in this frontend.

## ANTI-PATTERNS
- Do not add a new admin page with a divergent control layout without checking `users/page.tsx` first.
- Do not call backend directly outside `apiFetch` unless creating a new shared helper.
- Do not assume serializer fields exist; verify against backend contract before rendering chips/counts.
- Do not trust `.next` output for source truth when debugging route behavior.

## UNIQUE STYLES
- Density mode is controlled by `[data-density]` and shared CSS in `src/app/globals.css`.
- Table + grid dual-view pattern is localized in page files, not abstracted into reusable list components.
- Export behavior is client-side and page-local today.

## NOTES
- Both `users/page.tsx` and `roles/page.tsx` are >600-line hotspots.
- If this subtree grows, split page-local utilities/components before adding more complexity inline.
