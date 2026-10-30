# AMS frontend

Next.js 16.2.4 / React 19 frontend for the AMS Django API.

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
cookie authentication, for example `ams.example.com` and `api.example.com`.
Next.js manages its standard `NODE_ENV` internally for its dev/build/start
commands; application behavior does not branch on that value.
