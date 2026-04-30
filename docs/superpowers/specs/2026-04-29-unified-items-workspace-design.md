# Unified Items Workspace Design

Date: 2026-04-29
Status: Draft for review
Scope: `ams-redesign` frontend only, with route compatibility for existing item pages

## Summary

Replace the current route chain around items with one canonical `/items` workspace.

- The left pane remains the item listing and filter surface.
- The right pane becomes the selected item workspace.
- `Distribution` is the default detail view.
- `Instances` and `Batches` become conditional tabs inside the same workspace instead of separate primary pages.
- Individual instance detail remains a dedicated deep-detail page.

This design preserves the current backend contracts and permission model while removing the current nested navigation flow.

## Problem

The live item module currently behaves like several adjacent pages:

- `/items`
- `/items/[id]`
- `/items/[id]/distribution/[standaloneId]`
- `/items/[id]/instances`
- `/items/[id]/batches`

That structure forces users through route hops to understand one item. It makes distribution, instances, and batches feel like separate destinations instead of different views of the same record.

The reference prototype in `item-module/Items.html` and `item-module/items-app.js` shows the intended UX more clearly:

- one item workspace
- list on the left
- selected item detail on the right
- inline drill-down instead of nested page churn

## Goals

1. Make `/items` the canonical item workspace.
2. Keep item selection, distribution, instances, and batches in one continuous view.
3. Remove primary reliance on nested item routes for normal browsing.
4. Preserve backend contracts, permission gating, and existing CRUD behavior.
5. Keep dedicated deep-detail pages only where they still add value, especially item instance detail.

## Non-Goals

1. Do not redesign the backend distribution API in phase 1.
2. Do not replace item create/edit/delete behavior.
3. Do not introduce a new frontend data library.
4. Do not rebuild the HTML prototype verbatim; reuse live app contracts and permission logic.
5. Do not remove deep-link support for old routes without compatibility redirects.

## Approaches Considered

### Approach A: Keep the current route model and polish each page

Pros:

- lowest implementation risk
- minimal routing changes

Cons:

- does not solve the core UX problem
- still feels like four disconnected pages

### Approach B: Make `/items` the unified workspace and keep deep-detail routes only for drill-down

Pros:

- matches the prototype intent
- best user experience improvement
- preserves current APIs and permissions
- allows old routes to redirect into the canonical workspace

Cons:

- requires moderate frontend restructuring
- needs careful URL-state and tab-state handling

### Approach C: Rewrite the item module directly from the exported prototype

Pros:

- fast visual parity with the standalone mock

Cons:

- throws away working frontend contract logic
- high regression risk
- likely duplicates code that already exists in the live app

### Recommendation

Use Approach B.

It solves the navigation problem without discarding the current working route wrappers, data loaders, or permission-aware actions.

## Chosen UX Model

### Canonical route

The canonical browsing route becomes:

`/items`

Optional query parameters carry workspace state:

- `item=<itemId>`
- `tab=distribution|instances|batches`
- `location=<standaloneLocationId>`

Examples:

- `/items?item=42`
- `/items?item=42&tab=instances`
- `/items?item=42&tab=batches`
- `/items?item=42&tab=distribution&location=17`

### Workspace structure

The page becomes a split workspace:

- Left pane: item listing, filters, density toggle, create action
- Right pane: selected item workspace or empty state

### Right-pane structure

The right pane has four layers:

1. Item summary header
2. Summary metrics strip
3. Conditional workspace tabs
4. Active tab content

Phase 1 tabs:

- `Distribution` for every item
- `Instances` only when `tracking_type === INDIVIDUAL`
- `Batches` only when `tracking_type === QUANTITY && category_type === PERISHABLE`

No separate full-page distribution/instances/batches browsing is needed for the main user flow.

### What remains a dedicated page

Keep the dedicated item instance detail page:

- `/items/[id]/instances/[instanceId]`

Reason:

- a single instance record is a real detail object with its own inspection certificate, stock entry links, QR asset, and editable serial number
- the instance-detail page is now a true drill-down page, not a navigation hub

## Route Compatibility Design

The old routes remain temporarily, but their job changes.

### Redirect targets

- `/items/[id]` -> `/items?item=[id]&tab=distribution`
- `/items/[id]/instances` -> `/items?item=[id]&tab=instances`
- `/items/[id]/batches` -> `/items?item=[id]&tab=batches`
- `/items/[id]/distribution/[standaloneId]` -> `/items?item=[id]&tab=distribution&location=[standaloneId]`

### Compatibility rule

The old routes are no longer primary views. They become compatibility entry points for bookmarks, shared links, and existing internal navigation that has not yet been cleaned up.

## Component Architecture

The current `src/components/ItemModuleViews.tsx` is too large to keep extending as one file. The unified workspace should split responsibilities into focused components.

### New frontend structure

Create a focused workspace area under:

`src/components/items-workspace/`

Recommended files:

- `ItemsWorkspacePage.tsx`
- `ItemsWorkspace.module.css`
- `ItemsListPane.tsx`
- `ItemWorkspaceDetailPane.tsx`
- `ItemWorkspaceTabs.tsx`
- `DistributionTab.tsx`
- `InstancesTab.tsx`
- `BatchesTab.tsx`
- `LocationDetailDrawer.tsx`
- `useItemsWorkspaceState.ts`

### Existing code to reuse

Keep and reuse existing behaviors from `src/components/ItemModuleViews.tsx`:

- item list loading and filtering
- item create/edit/delete modal flow
- `useItemDistribution`
- `useItemRelatedList`
- item permission checks
- item tracking helpers from `src/lib/itemUi.ts`

### Existing code to keep separate

Do not merge the existing item instance detail page back into the workspace:

- `src/components/item-instance/ItemInstanceDetailView.tsx`

It stays separate and linked from the workspace’s `Instances` tab.

## Data and State Design

### Left-pane state

The list pane keeps its existing local state patterns:

- search
- category filter
- tracking filter
- status filter
- density
- list/grid presentation

These remain page-local UI state and do not need to move into the URL in phase 1.

### Right-pane state

The canonical workspace state comes from query params:

- selected item id
- active tab
- optionally focused distribution location

This allows refresh-safe deep linking without turning every filter into URL state.

### Loading strategy

Use lazy tab loading.

- When an item is selected, load distribution data immediately because `Distribution` is the default tab.
- Load instances only when the `Instances` tab becomes active.
- Load batches only when the `Batches` tab becomes active.

This keeps the workspace responsive and avoids loading every related dataset for every item selection.

### Cache behavior

Keep in-memory cache keyed by `itemId` and tab type within the workspace session.

That avoids repeated reloads when switching between tabs for the same item while staying simple enough for the current codebase.

## Distribution Tab Design

### Purpose

The distribution tab becomes the primary operational view of an item.

### Content

The distribution tab should show:

- item-level distribution summary
- standalone locations list or hierarchical grouping
- ability to open a focused location detail drawer

### Drawer behavior

The existing standalone distribution detail route is replaced in the normal flow by an inline drawer/panel.

The drawer shows:

- selected location/store summary
- quantities at that node
- child locations if present
- related instances at that location if relevant
- contextual actions if already supported

If `location=<id>` exists in the URL, the distribution tab should open that location drawer automatically.

## Instances Tab Design

### Availability

Show only when the selected item is individually tracked.

### Content

The instances tab should show:

- filterable instances list for the selected item
- optional location-scoped filtering when coming from a distribution context
- row click opening the existing instance-detail page

### No separate browsing page in the main flow

The instances tab replaces `/items/[id]/instances` as the primary browsing surface. The route may still exist as a redirect target, but the user should not feel pushed into a separate page just to browse the item’s tracked units.

## Batches Tab Design

### Availability

Show only when the selected item is batch-relevant:

- quantity tracked
- perishable category

### Content

The batches tab should show:

- batch number
- expiry/manufacturing data
- quantities
- optional location filtering

As with instances, this replaces `/items/[id]/batches` as the primary browsing surface.

## Permissions

No backend permission changes are required in phase 1.

The workspace must preserve existing frontend gating:

- `items` view permission gates access to the page
- `items manage` gates create/edit actions
- `items full` gates destructive actions

Tab visibility is based on item semantics, not permissions alone:

- `Instances` depends on tracking type
- `Batches` depends on tracking + category type

## Error Handling

### Item selection errors

If the selected `item` query param points to an item that does not exist or is not accessible:

- clear the right pane to an empty/error state
- keep the list visible
- show a retry/dismissible error

### Tab data errors

A failure in one tab must not break the whole workspace.

Rules:

- distribution failure shows an error inside the distribution pane
- instances failure shows an error inside the instances pane
- batches failure shows an error inside the batches pane
- list pane remains usable throughout

### Invalid tab combinations

If the URL requests an invalid tab:

- `tab=instances` for a quantity item
- `tab=batches` for a non-perishable item

then normalize back to `distribution`.

## Mobile Behavior

Desktop uses split view.

Mobile should preserve the same model without forcing a second design:

- list first
- selecting an item reveals the detail pane
- a “Back to items” control returns to the list

This mirrors the behavior already demonstrated in the standalone prototype without creating a separate route tree for mobile.

## File-Level Change Plan

### Primary files to change

- `src/app/(dashboard)/items/page.tsx`
- `src/components/ItemModuleViews.tsx`
- `src/lib/itemUi.ts`

### Primary files to add

- `src/components/items-workspace/ItemsWorkspacePage.tsx`
- `src/components/items-workspace/ItemsWorkspace.module.css`
- `src/components/items-workspace/ItemsListPane.tsx`
- `src/components/items-workspace/ItemWorkspaceDetailPane.tsx`
- `src/components/items-workspace/DistributionTab.tsx`
- `src/components/items-workspace/InstancesTab.tsx`
- `src/components/items-workspace/BatchesTab.tsx`
- `src/components/items-workspace/LocationDetailDrawer.tsx`
- `src/components/items-workspace/useItemsWorkspaceState.ts`

### Compatibility route files to simplify

- `src/app/(dashboard)/items/[id]/page.tsx`
- `src/app/(dashboard)/items/[id]/instances/page.tsx`
- `src/app/(dashboard)/items/[id]/batches/page.tsx`
- `src/app/(dashboard)/items/[id]/distribution/[standaloneId]/page.tsx`

These should become redirect-style wrappers into the canonical `/items` workspace.

### Dedicated detail file to preserve

- `src/app/(dashboard)/items/[id]/instances/[instanceId]/page.tsx`
- `src/components/item-instance/ItemInstanceDetailView.tsx`

## Testing and Verification

### Required checks

1. `npm run build`
2. manual test of `/items`
3. manual test of compatibility routes redirecting into workspace state
4. manual test of conditional tabs by item type
5. manual test of instance-detail deep link still working

### Suggested targeted tests

Add lightweight tests for pure helpers only, especially:

- URL-state normalization
- invalid-tab fallback
- query-param to workspace-state parsing

Do not block phase 1 on a heavy frontend test harness.

## Risks

### Large-file migration risk

`src/components/ItemModuleViews.tsx` already contains most of the item module logic. Editing it in place without decomposition will increase fragility.

Mitigation:

- extract workspace components first
- keep route wrappers thin

### Duplicate behavior during transition

During migration, both new workspace behavior and old routes may coexist.

Mitigation:

- define `/items` as canonical immediately
- convert old route files into compatibility wrappers quickly

### Performance risk

If the right pane loads too much data on every selection, the workspace may feel slow.

Mitigation:

- lazy-load non-default tabs
- cache per-item tab data in session state

## Phase 1 Deliverable

Phase 1 is complete when:

1. `/items` is the main item workspace
2. selecting an item fills the right pane instead of routing away
3. distribution is the default right-pane view
4. instances and batches are tabs inside the same workspace
5. old item routes redirect into canonical workspace state
6. item instance detail remains a dedicated deep-detail page

## Implementation Recommendation

Implement this in two passes:

1. Build the new `/items` workspace and its internal tabs
2. Convert old route pages into compatibility redirects and clean internal links

That sequencing minimizes user-facing breakage while moving the app to the intended design model quickly.
