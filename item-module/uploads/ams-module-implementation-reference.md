# AMS Module Implementation Reference

This document is the implementation reference for future AMS modules such as inspection, stock entries, and similar dashboard/admin pages.

Use it when building a new module so the result matches the existing system in:

- layout and visual structure
- list-page behavior
- add/edit form behavior
- permission-aware UI
- route protection
- frontend/backend contract discipline

This document is based on the current active code only.

## Primary reference files

### Frontend

- `ams-redesign/src/app/(dashboard)/layout.tsx`
- `ams-redesign/src/app/(dashboard)/users/page.tsx`
- `ams-redesign/src/app/(dashboard)/roles/page.tsx`
- `ams-redesign/src/app/login/page.tsx`
- `ams-redesign/src/app/403/page.tsx`
- `ams-redesign/src/components/Topbar.tsx`
- `ams-redesign/src/components/AppSidebar.tsx`
- `ams-redesign/src/components/AddUserModal.tsx`
- `ams-redesign/src/contexts/AuthContext.tsx`
- `ams-redesign/src/lib/api.ts`
- `ams-redesign/src/lib/userUiShared.ts`
- `ams-redesign/src/lib/adminPermissions.ts`
- `ams-redesign/src/proxy.ts`
- `ams-redesign/src/app/globals.css`

### Backend

- `backend/ams/permissions.py`
- `backend/ams/urls.py`
- `backend/user_management/views.py`
- `backend/user_management/serializers.py`
- `backend/user_management/urls.py`

## Core rules

1. The active frontend is `ams-redesign/`, not the top-level legacy `app/` folder.
2. New dashboard/admin pages must follow `users/page.tsx` first and `roles/page.tsx` second.
3. Frontend API access goes through `src/lib/api.ts`.
4. Backend serializer shapes are the source of truth for frontend rendering.
5. Frontend permission checks are UX only; backend permission checks are the actual security boundary.
6. New modules must implement the same four-layer pattern:
   - backend model/queryset protection
   - serializer/API contract
   - route protection
   - frontend visibility/action gating

## How to think about a new module

When implementing a new module, build it in this order:

1. Define or verify the backend serializer fields.
2. Verify the backend endpoints and permission enforcement.
3. Define frontend permission constants.
4. Add route protection.
5. Add sidebar visibility rules.
6. Build the page shell.
7. Build the list/table/grid view.
8. Build add/edit modal or form.
9. Gate every action button by permission.

Do not start from visual markup alone. Start from the backend contract, then align the frontend to it.

## Dashboard page shell standard

Dashboard module pages belong under:

- `ams-redesign/src/app/(dashboard)/...`

They are rendered inside the authenticated shell from `src/app/(dashboard)/layout.tsx`.

That shell is responsible for:

- authenticated layout framing
- sidebar + main content structure
- redirecting unauthenticated users to `/login`

### Required page structure

For new dashboard pages, keep this structure consistent:

1. `Topbar`
2. `.page` wrapper
3. optional error/loading banners
4. `.page-head`
5. `.filter-bar`
6. content area (`table` and optionally `grid`)
7. modal/form flows

The current best reference is:

- `ams-redesign/src/app/(dashboard)/users/page.tsx`

## Login page is different

`ams-redesign/src/app/login/page.tsx` is a standalone auth page.

Do **not** use it as the template for dashboard modules.

It does not share:

- the dashboard shell
- sidebar behavior
- topbar behavior
- list-page controls
- admin CRUD layout

Use it only as the pattern for future standalone auth pages.

## Listing page standard

Every new admin/listing module should look structurally consistent with the current `users` and `roles` pages.

### 1. Page head

Use `.page-head` with two areas:

- left: title group
- right: page-level actions

The title group usually contains:

- eyebrow text
- `h1`
- short subtitle in `.page-sub`

The right side should hold module-level actions such as:

- add/create
- export
- high-level navigation shortcuts

Keep the primary create action here.

### 2. Filter bar

Use `.filter-bar` as the standard control strip.

Layout rule:

- left side: search + filters
- right side: density/view/export/create controls

Common controls already used:

- `.search-input`
- chip filters
- segmented controls for density/view mode

If a module has fewer filters, still preserve the same left/right layout.

### 3. Search behavior

Search is page-local state.

Do not invent a new shared search abstraction unless the codebase already needs one. Current pages keep filtering logic local.

### 4. Density behavior

Density is a shared page-level convention.

Use a page state like:

- `compact`
- `balanced`
- `comfortable`

Bind it to `data-density={density}` at the page level and rely on `globals.css` to adjust spacing.

Do not create module-specific density styling unless absolutely necessary.

### 5. Table and grid views

The current system supports dual presentation where useful:

- table view for dense scanning
- grid/card view for more visual browsing

Reference files:

- `users/page.tsx`
- `roles/page.tsx`

Rules:

1. Both views must use the same filtered dataset.
2. Both views must expose equivalent actions.
3. Switching view mode must not change permission behavior.
4. If a module does not benefit from grid view, table-only is acceptable, but do not invent a different table scaffold.

### 6. Table standard

Current list pages use the shared table styling primitives:

- `.table-card`
- `.table-card-head`
- `.data-table`
- `.table-card-foot`

When building a new module table:

- keep actions at the far right
- keep headings simple and explicit
- keep row height controlled by density
- preserve empty/loading/error states cleanly

### 7. Grid/card standard

If the module needs a grid view, use the same concept as the current pages:

- card grid container
- card body with key data
- card footer/actions matching table actions

Do not make table actions and card actions diverge.

## Row and card action standard

Current pages keep actions compact and permission-aware.

Rules for future modules:

1. Show only actions the user is allowed to perform.
2. Keep common actions inline.
3. Move crowded/destructive actions into overflow if needed.
4. Keep destructive actions visually distinct.
5. Keep busy/disabled states explicit during mutations.
6. If the user has no available actions, render a clear fallback such as `No actions` instead of leaving the space ambiguous.

Typical mapping:

- edit -> `change`
- delete -> `delete`
- status toggle/archive/restore/update-like mutations -> usually `change`

## Add/edit form standard

The main reference is:

- `ams-redesign/src/components/AddUserModal.tsx`

Secondary reference:

- `ams-redesign/src/app/(dashboard)/roles/page.tsx` (`RoleModal`)

### Modal structure

Use the existing modal anatomy:

- `.modal-backdrop`
- `.modal`
- `.modal-head`
- `.modal-body`
- `.modal-foot`

Expected behavior:

- open in create or edit mode
- close button in header
- Escape closes modal
- state resets correctly on open
- save button reflects loading/busy state
- async dependencies block save until ready

### Form structure

Do not create long flat forms without sections.

Prefer sectioned forms with:

- section heading
- grouped related fields
- inline field labels/hints/errors
- footer status area

The current pattern uses concepts like:

- `Field`
- `Section`
- `.form-section`

Even if the exact helper component differs, preserve the same visual organization.

### Create/edit behavior

One component should usually support both create and edit unless there is a strong reason to split them.

Rules:

1. Modal title and submit button text should reflect the mode.
2. Existing values should preload in edit mode.
3. Validation should appear near the relevant field.
4. Save must be blocked while required reference data is still loading.
5. Backend error states should surface in the modal, not disappear silently.

### When not to use a modal

If a future module has a very large workflow, multi-step transaction, or deeply nested editing experience, a dedicated page may be better than a modal.

Even then, keep the same form principles:

- sectioned layout
- clear status/errors
- permission-gated actions
- serializer-driven field assumptions

## Permission system standard

Future modules must follow the same permission architecture already used for users and roles.

### Canonical permission map

The frontend canonical map lives in:

- `ams-redesign/src/lib/adminPermissions.ts`

Current admin modules follow Django permission codenames directly.

Examples:

- users: `auth.view_user`, `auth.add_user`, `auth.change_user`, `auth.delete_user`
- roles: `auth.view_group`, `auth.add_group`, `auth.change_group`, `auth.delete_group`

For a new module, define the same four operations if the backend model supports them:

- `view`
- `add`
- `change`
- `delete`

Do not invent frontend-only permission names.

### Permission checks in frontend

Frontend permission evaluation is provided by:

- `ams-redesign/src/contexts/AuthContext.tsx`

Use `useAuth().can(...)` as the standard API.

Current behavior:

- superusers always pass
- non-superusers pass if the exact permission exists or the permission string matches by suffix

Do not duplicate permission parsing logic inside each page.

### Sidebar visibility

Sidebar gating is implemented in:

- `ams-redesign/src/components/AppSidebar.tsx`

Rules:

1. A sidebar item should only appear if the route is implemented.
2. A sidebar item should only appear if the user has the required `view` permission.

For a new module:

- add its route to the implemented route list when the page truly exists
- require the module `view` permission for sidebar visibility

### In-page view gating

The page itself must also check its own `view` permission and redirect to `/403` when loaded by an unauthorized authenticated user.

Current references:

- `users/page.tsx`
- `roles/page.tsx`

This page-level guard is still required even if route protection exists.

### Route protection

Route protection is implemented in:

- `ams-redesign/src/proxy.ts`

Rules:

1. Protected routes are mapped to their required `view` permission.
2. If auth cookies are missing or `/auth/users/me/` fails with unauthenticated state, redirect to `/login`.
3. If the user is authenticated but lacks the required permission, redirect to `/403`.
4. Do not misclassify network/backend failures as fake authorization denials.

For a new module, add its route prefix and required `view` permission to the protected-route map.

### Button/action permission mapping

Use the same meaning everywhere:

- `view` -> can enter page and see module nav entry
- `add` -> can see create/add button
- `change` -> can edit and perform non-destructive updates
- `delete` -> can perform destructive removal actions

Examples from current pages:

- Add User -> `add user`
- Add Role -> `add group`
- Edit User -> `change user`
- Edit Role -> `change group`
- Delete User -> `delete user`
- Delete Role -> `delete group`
- user active/inactive toggle -> `change user`

Do not collapse all actions into a single generic permission check.

## Backend enforcement standard

The backend must enforce permissions independently of the frontend.

Primary reference:

- `backend/ams/permissions.py`

### Strict model-permission mapping

The current backend uses `StrictDjangoModelPermissions`.

Current mapping:

- `GET` -> `view`
- `POST` -> `add`
- `PUT`/`PATCH` -> `change`
- `DELETE` -> `delete`

Implication for future modules:

- if the page can show an action, the backend endpoint must still independently validate that action
- frontend hiding is not enough

### Queryset scoping

Do not assume model permissions are sufficient by themselves when row-level scoping exists.

The backend may also restrict which rows the user can see or mutate.

Future inventory-style modules should preserve any scoped queryset patterns already used in the backend rather than bypassing them for frontend convenience.

## Serializer-first frontend contract

Frontend rendering must follow serializer output.

Primary reference:

- `backend/user_management/serializers.py`

Rules:

1. Do not invent fields in the UI that the serializer does not provide.
2. Do not assume counts, labels, flags, or nested objects exist without checking the serializer.
3. If the UI needs a new field, add it to the serializer first.
4. Then update the frontend to use that field.

This is especially important for:

- chips
- counts
- status pills
- grouped/nested details
- option lists used by add/edit forms

## API usage standard

Frontend API access should go through:

- `ams-redesign/src/lib/api.ts`

Use the shared helper instead of ad hoc fetch patterns.

Current pages also already handle common DRF response shapes, such as paginated results.

When building a new module:

1. confirm the exact endpoint path from backend URLs
2. confirm the serializer response shape
3. fetch via `apiFetch`
4. normalize paginated vs non-paginated responses carefully

## Permission-catalog pattern

If a module includes role/permission assignment UI, follow the current roles-page pattern.

Primary backend reference:

- `backend/user_management/views.py` (`AvailablePermissionsView`)

Primary frontend reference:

- `ams-redesign/src/app/(dashboard)/roles/page.tsx`

Rules:

1. Load permission/reference data before allowing save.
2. Block modal submission while that data is loading or failed.
3. Return explicit backend objects for selectable permissions/options.
4. Do not hardcode option metadata in the frontend if the backend already owns it.

## Styling standard

The visual system is already defined in:

- `ams-redesign/src/app/globals.css`

Prefer existing primitives over inventing new ones.

Important shared concepts already in use:

- `.page`
- `.page-head`
- `.page-sub`
- `.filter-bar`
- `.table-card`
- `.data-table`
- button size/style classes
- chips/pills/status styling
- modal classes

When implementing a new page, exhaust existing primitives first.

Do not create a visually divergent admin page without a strong reason.

## Implementation checklist for future agents

When asked to implement a new module, complete this checklist:

### Backend

- [ ] Confirm model and serializer fields
- [ ] Confirm endpoint URLs
- [ ] Confirm `view/add/change/delete` permission codenames
- [ ] Confirm queryset scoping rules
- [ ] Confirm backend rejects unauthorized requests correctly

### Frontend permissions

- [ ] Add module permission constants to `adminPermissions.ts`
- [ ] Add protected route mapping in `proxy.ts`
- [ ] Add sidebar visibility rule in `AppSidebar.tsx`
- [ ] Add page-level `view` guard redirect to `/403`
- [ ] Gate create/edit/delete/update actions separately

### Frontend page structure

- [ ] Use dashboard shell route under `src/app/(dashboard)/`
- [ ] Add `Topbar`
- [ ] Add `.page-head`
- [ ] Add `.filter-bar`
- [ ] Use standard table scaffold
- [ ] Add grid view only if justified
- [ ] Reuse density/view control patterns

### Add/edit UX

- [ ] Use modal or form structure consistent with existing pages
- [ ] Support create and edit modes clearly
- [ ] Load required reference data before enabling save
- [ ] Surface validation and backend errors clearly
- [ ] Keep footer actions/status consistent

### Data discipline

- [ ] Use `apiFetch`
- [ ] Respect serializer shapes exactly
- [ ] Do not invent fields or flags
- [ ] Normalize paginated responses correctly

## Recommended starting template for future modules

If implementing a new module from scratch, use this reference order:

1. Copy the page structure approach from `users/page.tsx`
2. Copy any export/list dual-view ideas from `roles/page.tsx`
3. Copy modal/form sectioning from `AddUserModal.tsx`
4. Copy permission constant + route-protection patterns from `adminPermissions.ts` and `proxy.ts`
5. Verify every displayed field against backend serializers before finalizing UI

## Final guidance

If a future module feels visually or structurally different from `users` and `roles`, stop and verify whether that difference is truly necessary.

The default expectation in this codebase is consistency.

New modules should feel like they were built by the same team, in the same system, with the same permission model and the same layout language.
