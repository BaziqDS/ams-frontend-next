<!-- BEGIN:nextjs-agent-rules -->
# FRONTEND KNOWLEDGE BASE

**Generated:** 2026-04-21
**Commit:** N/A (frontend app may not be the git root from parent workspace)
**Branch:** N/A (verify locally if doing git work)

## OVERVIEW
Active frontend app. Next.js 16.2.4 + React 19 App Router under `src/`, dashboard/admin UI, cookie-auth integration with Django backend.

## STRUCTURE
```text
ams-redesign/
├── src/app/         # routes, layouts, globals.css
├── src/components/  # shared chrome + large admin modal
├── src/contexts/    # auth provider/state
├── src/lib/         # API helper + shared user UI utilities
├── public/          # static assets
└── .next/           # generated output, ignore for source reasoning
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| App shell | `src/app/layout.tsx`, `src/app/(dashboard)/layout.tsx` | root + auth-gated dashboard |
| Shared styling | `src/app/globals.css` | huge global stylesheet, cross-cutting |
| Admin pages | `src/app/(dashboard)/users/page.tsx`, `roles/page.tsx` | large page-local logic |
| Shared admin modal | `src/components/AddUserModal.tsx` | user create/edit + locations/groups |
| API requests | `src/lib/api.ts` | request + paginated response contract |
| Auth state | `src/contexts/AuthContext.tsx` | bootstraps `/auth/users/me/` |

## CODE MAP
| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `RolesPage` | function | `src/app/(dashboard)/roles/page.tsx` | role CRUD/export UI |
| `UsersPage` | function | `src/app/(dashboard)/users/page.tsx` | user admin UI |
| `AddUserModal` | component | `src/components/AddUserModal.tsx` | user provisioning workflow |
| `AppSidebar` | component | `src/components/AppSidebar.tsx` | route shell/navigation |
| `Topbar` | component | `src/components/Topbar.tsx` | breadcrumb + user chrome |
| `apiFetch` | function | `src/lib/api.ts` | backend contract boundary |

## CONVENTIONS
- This is NOT the Next.js you know. Read local Next docs in `node_modules/next/dist/docs/` before nontrivial framework changes.
- App Router lives in `src/app/`; dashboard routes are grouped under `src/app/(dashboard)/`.
- Frontend API access goes through `src/lib/api.ts`.
- `@/*` path alias is enabled and used broadly.
- Client-heavy page files are accepted in this codebase; do not assume abstraction exists already.

## ANTI-PATTERNS (THIS PROJECT)
- Do not treat `.next/` as editable source.
- Do not assume a generic frontend test harness exists; verify with build and targeted checks.
- Do not ignore backend serializer shapes when rendering admin data.
- Do not use training-time assumptions about older Next APIs without checking local docs.

## UNIQUE STYLES
- `globals.css` is a styling sink (>2000 lines); changes there are cross-cutting.
- Admin pages reuse patterns informally rather than through a component library.
- Auth flow is cookie-based; `401 /auth/users/me/` while logged out is expected bootstrap behavior.

## COMMANDS
```bash
npm run dev
npm run build
npm run start
```

## NOTES
- Child guidance exists for `src/app/(dashboard)/` because that subtree has distinct admin-page rules.
- Large hotspots: `globals.css`, `src/components/AddUserModal.tsx`, dashboard page files.
<!-- END:nextjs-agent-rules -->
