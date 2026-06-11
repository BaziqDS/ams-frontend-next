# AMS Frontend — Agent Context

> Self-contained brief for any agent picking up work in this project. Read this first.

## What this is

The **Asset Management System (AMS) web frontend**. Next.js 16 + React 19 App Router app that talks to the Django backend (`../ams-backend`) over an httpOnly cookie-JWT session, and embeds an AI copilot served from the LangGraph monorepo (`../langchain-agent-chat-openrouter`).

- Package name: `ams-redesign`
- Node entry: `src/app/layout.tsx` → `src/app/(dashboard)/layout.tsx`
- Path alias: `@/*` (used heavily)
- Dev port: `3000` (`npm run dev`)

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js `16.2.4` (App Router) — **not the Next you remember**; read `node_modules/next/dist/docs/` before nontrivial framework changes |
| UI runtime | React `19.2.4` (compiler-enabled via `babel-plugin-react-compiler`) |
| Language | TypeScript 5 |
| Component primitives | `@radix-ui/react-slot`, `@radix-ui/react-tabs`, `lucide-react` icons |
| Generative UI (copilot output) | `@openuidev/react-ui`, `@openuidev/react-lang` (`src/components/AssistantOpenUiRenderer.tsx`) |
| Validation | `zod` v4 |
| PDF | `@react-pdf/renderer` |
| Testing | `vitest` (`*.spec.ts(x)` files live next to source) + `jsdom` |

## Directory map

```
ams-frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # root layout
│   │   ├── page.tsx                # marketing / landing
│   │   ├── login/                  # cookie-JWT login flow
│   │   ├── 403/                    # forbidden page
│   │   ├── api/                    # Next route handlers (proxy bits)
│   │   ├── globals.css             # >2000-line styling sink — changes are cross-cutting
│   │   └── (dashboard)/            # auth-gated admin UI
│   │       ├── layout.tsx          # sidebar + topbar shell, auth guard
│   │       ├── dashboard/          # home metrics
│   │       ├── users/  roles/      # admin: provisioning + RBAC
│   │       ├── locations/  categories/
│   │       ├── items/  item-instances? (see components/item-instance)
│   │       ├── stock-entries/  stock-registers/
│   │       ├── inspections/        # multi-stage workflow (Draft → Stock → Central Reg → Finance → Final)
│   │       ├── depreciation/  maintenance/
│   │       ├── employees/  reports/  notifications/
│   │       └── AGENTS.md           # local rules for this subtree
│   ├── components/                 # shared chrome + large admin modals (AddUserModal, CategoryModal, …)
│   │   ├── AssistantPanel.tsx      # in-app AI copilot dock
│   │   ├── CopilotSidePanel.tsx    # detachable copilot
│   │   ├── CopilotVoiceOverlay.tsx # voice capture UI
│   │   ├── AssistantOpenUiRenderer.tsx  # renders OpenUI Lang → React
│   │   └── ui/  inspections/  item-instance/   # domain-grouped subcomponents
│   ├── contexts/AuthContext.tsx    # bootstraps `/auth/users/me/`, exposes user + perms
│   ├── hooks/                      # custom React hooks
│   ├── lib/                        # API client + every shared UI/business rule helper
│   │   ├── api.ts                  # `apiFetch`, error parsing, paginated response contract
│   │   ├── adminPermissions.ts     # RBAC checks against backend permission manifest
│   │   ├── copilot*.ts             # all copilot bridge concerns (focus, page context, action readiness, HITL, etc.)
│   │   ├── inspection*.ts  stockEntry*.ts  item*.ts  location*.ts  # per-module form rules
│   │   ├── notification*.ts        # toast / bus / display
│   │   └── voice*.ts               # mic capture + translate
│   ├── generated/                  # generated TS (do not hand-edit)
│   └── proxy.ts                    # request proxy helper
├── scripts/export-openui-prompt.mjs  # `npm run openui:prompt` — exports OpenUI syntax to a prompt file
├── dashboard-design-mockups/         # design refs (not built)
├── docs/                             # in-repo docs
└── next.config.ts
```

## Backend contract

- All requests go through **`src/lib/api.ts` → `apiFetch`**. Don't `fetch()` the backend directly from components.
- Base URL: `process.env.NEXT_PUBLIC_API_URL` (defaults to `http://localhost:8000`).
- Auth: **httpOnly cookie-based JWT**. The browser never sees tokens.
  - Bootstrap: `GET /auth/users/me/` on mount via `AuthContext`. A `401` while logged out is expected.
  - Login / refresh / logout: `/auth/cookie/login/`, `/auth/cookie/refresh/`, `/auth/cookie/logout/`.
- Module surfaces (Django apps → URL prefixes):
  - `/api/users/...`  (users, groups, profiles, available-permissions)
  - `/api/inventory/...`  (locations, categories, items, item-instances, item-batches, stock-entries, stock-registers, stock-corrections, stock-allocations, inspections, employees, persons, movement-history, depreciation/*, maintenance/*)
  - `/api/notifications/...`
  - `/api/ai/...`  (Django-side AI assistant helpers; distinct from the LangGraph copilot)
- Backend uses DRF serializers as the schema source of truth. Update serializers before assuming a new field exists on the client.

## Copilot integration (cross-project)

The LangGraph agent in `../langchain-agent-chat-openrouter` runs in its own iframe/panel and talks to this app via `postMessage` + a `copilotBridge` exposed on `window`. Every `lib/copilot*.ts` file owns a slice of that contract:

| File | Responsibility |
|---|---|
| `copilotPageContext.ts` | Builds the `CONTEXT_UPDATE` snapshot (form schema, current values, list rows, detail page, permissions, recent activity) sent to the agent every step |
| `copilotAppMap.ts` / `copilotModuleManifest.ts` | Manifest of AMS routes/forms the agent can target via `run_frontend_action` / `get_app_map` |
| `copilotFormRuntime.ts` / `copilotFormIds.ts` | Resolve agent field paths to the live form DOM/state |
| `copilotNavigation.ts` / `copilotListControls.ts` | Implement `navigate_to_route`, `set_list_filters` actions |
| `copilotDetachedApproval.ts` / `copilotHitlAutoResolve.ts` | HITL approval card flow for `request_form_submit` |
| `copilotActionReadiness.ts` / `copilotPendingAction.ts` | Gate actions until the page is ready |
| `copilotActivity.ts` / `copilotManualSubmitActivity.ts` | Surface activity log entries back to the agent |
| `proactiveAgentDispatcher.ts` | Trigger the agent unprompted on certain UI events |

The agent's final response is **OpenUI Lang**, rendered by `AssistantOpenUiRenderer.tsx`. Plain markdown won't render.

## Responsive design system (added 2026-06-10)

The app is built for a viewport range of **1024px → 1920px** and survives Windows display scaling (100 / 125 / 150%) by being fully fluid in `rem` rather than locked to px.

### How it works

1. **Fluid root font-size** — `html { font-size: clamp(0.90625rem, 0.74375rem + 0.25vw, 1rem); }` in `src/app/globals.css`. `1rem` resolves to ~14.5px at a 1024px viewport, ~15.4px at 1440px, 16px at 1920px. **The entire UI scales together** because everything below is in `rem`.
2. **All spacing, sizing and typography is in `rem`.** Hardcoded `Npx` is reserved for `1–2px` hairlines, focus rings, `box-shadow` offsets, and hardware-pixel-aligned icons. Anything else in px is a bug.
3. **Design tokens live in `:root`** in `src/app/globals.css` (after the existing color/shape tokens):
   - `--space-0` … `--space-24` — 4-point spacing scale in rem (`--space-px` is the literal `1px` hairline)
   - `--fs-2xs` … `--fs-4xl` — fluid `clamp()`-based type scale
   - `--bp-sm` … `--bp-4xl` — breakpoint reference values (also usable by JS via `getComputedStyle(document.documentElement).getPropertyValue('--bp-lg')`)
4. **Breakpoints already in use** (search `@media` in `globals.css`): mobile-down at 40rem / 45rem / 56.25rem, desktop tiers at 64rem (1024px), 75rem (1200px), 90rem (1440px), 96rem (1536px), 120rem (1920px). Use these tiers; don't invent new ones at odd values.
5. **`@media` queries use bare `rem`** — CSS resolves rem in media queries against the UA default 16px, *not* against the fluid html font-size, so `64rem = 1024px` deterministically regardless of viewport.

### Rules going forward

- ❌ `padding: 16px;` — always wrong now. ✅ `padding: var(--space-4);` (or `1rem` if a token doesn't fit).
- ❌ `font-size: 14px;` — wrong. ✅ `font-size: var(--fs-md);` (fluid) or `font-size: 0.875rem;` (static).
- ❌ `width: 480px;` — wrong. ✅ `width: 30rem; max-width: 100%;` or grid `minmax(20rem, 1fr)`.
- ✅ `border: 1px solid var(--border);` — px is correct for hairlines.
- ✅ `box-shadow: 0 1px 2px rgba(0,0,0,.06);` — px is correct for shadow offsets.
- ✅ `border-radius: 999px;` — px is the pill-shape idiom.

### Conversion script

`scripts/convert-px-to-rem.mjs` does the `px → rem` migration on the curated CSS files listed at the top of the script. It preserves px in shadow lines, small borders, the pill idiom, and 0. Re-run after adding a new stylesheet that needs to participate:

```bash
node scripts/convert-px-to-rem.mjs --dry-run   # report only
node scripts/convert-px-to-rem.mjs             # write, with .bak per file
```

The first run wrote `<file>.bak` backups for every processed CSS file (these are safe to delete once you're satisfied — they exist as a recovery option only).

### Testing matrix

When judging layout / taking screenshots, **test all of these**:

| Effective viewport | How to reproduce |
|---|---|
| 1093 × 614 | 1366×768 panel @ 125% Windows scaling (common 14" laptop) |
| 1280 × 720 | 1280 viewport in DevTools |
| 1440 × 900 | the codebase's primary design target |
| 1536 × 864 | 1920×1080 @ 125% scaling |
| 1920 × 1080 | 1080p monitor @ 100% |

If a layout looks wrong at any of these, the fix is almost always to replace a fixed width with `minmax()`, `clamp()`, or `%` — not to add a media query.

## Conventions and anti-patterns

- **Don't** treat `.next/` as source.
- **Don't** assume a generic frontend test harness — verify with `npm run build` + targeted `vitest` runs on relevant `*.spec` files.
- **Don't** introduce a UI component library; this codebase deliberately uses informal patterns + Radix primitives + plain CSS.
- **Don't** assume older Next API shapes from training data — Next 16 has its own quirks; consult local docs.
- **Don't** ignore backend serializer shapes when rendering admin data.
- Client-heavy page files are accepted. Don't refactor toward server components without explicit reason.
- `globals.css` is shared and cross-cutting — edits there affect everything.
- Tests live as `*.spec.ts(x)` siblings of their target file; there's no `__tests__/` convention.
- **No bare `px` for spacing / sizing / typography** (see Responsive design system above). Use `rem`, the `--space-*` tokens, or the `--fs-*` tokens. CI doesn't enforce this yet, but `git grep -E '\b[0-9]+px\b' src/app/globals.css` should ideally only hit shadows, borders ≤2px, and the pill idiom.

## Commands

```bash
npm run dev                                   # next dev (Turbopack), port 3000
npm run dev:webpack                           # next dev with the legacy webpack bundler
npm run build                                 # production build
npm run start                                 # serve built app
npm run openui:prompt                         # regenerate the OpenUI syntax prompt for the copilot
npx vitest                                    # run unit tests (vitest.config.ts at root)
node scripts/convert-px-to-rem.mjs --dry-run  # audit px usage across CSS
node scripts/convert-px-to-rem.mjs            # apply px -> rem migration
```

## Local dev

- Backend must be running on `http://localhost:8000` (or `NEXT_PUBLIC_API_URL` set).
- Superuser for manual testing: username `admin`, password `admin`.
- When taking screenshots / judging layout, use a **desktop viewport (≥1440×1000)** — the design is desktop-first.
- The LangGraph copilot is independently launched from `../langchain-agent-chat-openrouter` (LangGraph on `2024`, its web on `3001`); this frontend embeds it via the URL configured in copilot bridge code.

## Where to start, by task

| Task | Open this first |
|---|---|
| Add/modify a backend-backed page | the matching `src/app/(dashboard)/<module>/page.tsx` + `src/lib/api.ts` |
| New admin field on user / role | `src/components/AddUserModal.tsx` + backend `user_management/serializers.py` |
| Inspection workflow change | `src/app/(dashboard)/inspections/` + `src/lib/inspection*.ts` |
| Stock entry form rule | the relevant `src/lib/stockEntry*.ts` file (rules are split by concern: form, item, location, movement, correction) |
| Copilot can't see / drive a new page | add a manifest entry in `src/lib/copilotAppMap.ts` + register actions in `src/lib/copilotNavigation.ts` / `copilotListControls.ts` |
| Auth / permission gate | `src/contexts/AuthContext.tsx` + `src/lib/adminPermissions.ts` |
| Global styling tweak | `src/app/globals.css` (cross-cutting — search before editing) |
