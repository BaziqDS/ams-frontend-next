# AMS frontend

Next.js 16.4.3 / React 19 frontend for the AMS Django API.

Copy `.env.example` to `.env.local` and fill in the URLs and optional keys.
There is no application development/production selector. For local access,
use `NEXT_PUBLIC_API_URL=http://localhost:8000` and, if available,
`NEXT_PUBLIC_COPILOT_URL=http://localhost:3001`.

```sh
npm ci
npm run dev
```

For deployment, set the public URLs before building:

```sh
npm ci
npm run build
npm run start
```

`NEXT_PUBLIC_*` values are public and embedded at build time; rebuild after
changing them. `GROQ_API_KEY` and `GOOGLE_TRANSLATE_API_KEY` are optional
server-only credentials for voice features. The copilot service is external
and must be deployed separately if used. The Django API must be reachable
from both the browser and the Next.js server.

Configure the Django CORS/CSRF origins to include the frontend's actual origin.
Keep frontend and backend domains compatible with the existing SameSite=Lax
cookie authentication. For example, `ams.example.com` and `api.example.com`
require backend `COOKIE_DOMAIN=.example.com` so the Next.js server can forward
and validate the session. Prefer an empty cookie domain when both share one host.
`AMS_BACKEND_URL` optionally overrides the backend URL used by voice routes on
the server. Voice requires the user's chatbot preference to be enabled and uses
backend per-user quotas. Browser writes, including multipart uploads, send CSRF.
Expired access cookies are refreshed once before retrying.
Next.js manages its standard `NODE_ENV` internally for its dev/build/start
commands; application behavior does not branch on that value.

Verification: `npx vitest run`, `npx tsc --noEmit`, `npm run build`, `npm audit`.
One optional iframe integration test requires the separate Copilot repository.
