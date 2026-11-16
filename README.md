# TravelFix — Production

Location-aware travel problem solving. Guests get help without an account.
One account covers Travel and Contribute. Admins moderate contributions,
resources and reports. AI guidance is grounded in published solutions and
verified resources only. It never invents phone numbers, addresses, official
contacts or service availability. Emergency categories lead with official help.

## Layout

```text
travelfix-production/
  backend/    Express + Postgres API (Render web service, or Vercel serverless)
    src/app.js       all routes (auth, cases, solutions, contributions, admin, zip)
    src/index.js     Render entry point: runs migrations on boot, then serves
    src/migrate.js   schema + RLS + seed resources and sample solutions
    src/plan.js      grounded plan generation (no invented contacts)
    src/db.js        pg pool (DATABASE_URL)
    src/auth.js      JWT auth, guest tokens, admin guard
    api/index.js     Vercel serverless entry point (lazy migrate once)
    Dockerfile       Node 24 image for Render Docker deploys
  frontend/   React + Vite + TypeScript (Vercel)
    src/App.tsx      router (pushState, no hash routing), layout, nav
    src/pages.tsx    Home, Solve, Case, Solutions, Auth, Dashboard,
                     My Travel, My Contributions, Settings, Admin
    src/api.ts       typed API client (safe storage, token + guest token)
    vercel.json      SPA fallback rewrites
  render.yaml Render Blueprint for the API service
```

## Data model (Postgres)

- `profiles` — id, name, email (unique), role user/admin, home_base, notification
  and privacy preferences.
- `cases` — profile_id or guest_token, problem, category, location, destination,
  urgency low/medium/high/critical, status Submitted / Clarification Required /
  Analyzing / Solution Ready / Awaiting User / Unresolved / Resolved / Closed /
  Expired, summary, immediate_actions, steps, alternatives, sources,
  clarification_question, feedback.
- `case_messages` — follow-up chat per case (user / assistant).
- `contributions` — profile_id, destination, title, problem, solution, steps,
  tips, sources, status Draft / Pending Review / Changes Requested / Approved /
  Published / Rejected / Archived, admin_comment.
- `resources` — name, category, destination, description, url, contact_info,
  verified, status active/outdated/inactive, last_verified.
- `reports` — target_type solution/resource, target_id, reason, reporter,
  status open/investigating/resolved.
- `saved_solutions` — profile_id + contribution_id.

Row Level Security is enabled on all tables. The API also enforces ownership
in application code on every private read and write.

## Environment

Backend:

```text
DATABASE_URL=postgresql://user:password@host:5432/travelfix_db
FRONTEND_URL=https://<frontend-domain>
JWT_SECRET=<long random string>
PORT=10000
```

Frontend (build time):

```text
VITE_API_URL=https://<backend-origin>
```

## Local run

```text
cd backend && npm install
# put DATABASE_URL in backend/.env, then:
npm run migrate   # schema + seed (idempotent)
npm start         # API on :10000, /health, /ready
cd ../frontend && npm install
VITE_API_URL=http://localhost:10000 npm run dev
```

## Verification done locally (2026-11-16)

- Frontend: `npm run build` passes (tsc + vite).
- Backend: boots, `GET /health` returns `{"ok":true}`, migration failure is
  handled gracefully and the server still starts.
- Schema: validated against pg-mem — all 7 tables, RLS policies parse on
  real Postgres (pg-mem cannot parse CREATE POLICY, so those lines were
  stripped only for the emulator run).
- Full API end-to-end test against pg-mem: 29 checks passed, covering guest
  case submission and plan, follow-ups, resolve + feedback, signup, admin
  bootstrap, blocked self-promotion to admin, My Travel, contribution submit,
  pending-not-public, admin approve, published-is-public, save, reports,
  admin overview, non-admin blocked, zip export, and Google/OTP shown as
  not connected. Two real bugs were found and fixed by this test: an ambiguous
  column in the solutions list query, and a bad destructure in admin overview.

## Live infrastructure already created

- **Supabase (live, 2026-11-16):** project `travelfix`, ref
  `bukxabfcuneexxmpibft`, region ap-south-1 (Mumbai), status
  ACTIVE_HEALTHY, free plan. All 7 tables created
  (`profiles`, `cases`, `case_messages`, `contributions`, `resources`,
  `reports`, `saved_solutions`) with RLS policies, seeded with 5 verified
  resources and 3 published community solutions (verified by counting
  rows through the Management API). `backend/.env` (mode 0600,
  gitignored, never commit it) now points `DATABASE_URL` at Supabase;
  the old Render Postgres URL is backed up in `/tmp` only.
- Render Postgres `travelfix-db` (id `dpg-dbtdlq6i0phs73feoop0-a`), free plan,
  Singapore, Postgres 16, status available. **It expires 2026-12-16 and its
  data is deleted then.** It is no longer the primary database; Supabase
  is. The backend runs the schema migration on boot, so the tables are
  created the first time the API starts against a fresh database.
- **Local API verification against Supabase is blocked in this VM:**
  the sandbox egress blocks non-HTTP TLS, so direct Postgres connections
  (direct host and pooler, port 5432/6543) fail with "error establishing
  an SSL connection" — verified with openssl (no peer certificate). The
  backend still boots locally (`/health` returns `{"ok":true}`) and
  `/ready` honestly reports `db: unavailable` here. On Render/Vercel
  the same code has normal network access, so this is a VM limitation,
  not a code or database problem. Schema + seed were verified through
  the Supabase Management API SQL endpoint instead, and the full API
  was verified 29/29 against pg-mem.

## What is still blocked (free tier only, no purchases made)

1. **Supabase database — RESOLVED 2026-11-16.** The user deleted the
   `travel-problems` project, freeing a slot. A new free project
   `travelfix` (ref `bukxabfcuneexxmpibft`, ap-south-1) was created,
   all 7 tables + RLS + seed data applied and verified (see above).
2. **Vercel deploys — STILL BLOCKED, retried 2026-11-16 after the user
   reconnected Vercel including the aura-builders team scope.** Every
   Vercel write still returns HTTP 403: "Not authorized: Trying to
   access resource under scope aura-builders. You must re-authenticate
   to this scope." (teamId `team_LaextSX16cm3tAzVNX4fnOjP`). The error
   names a remediation tool `authorize_team_access`, but that tool
   does not exist in this environment (checked `list-tools`). The
   reconnect did not give the MCP token the team scope. Unblock: the
   user must complete team access approval for the Muse/Vercel
   integration from the Vercel dashboard (team aura-builders → Settings
   → Integrations / authorized apps), or disconnect/reconnect again
   and approve the team scope when prompted. The frontend and the
   backend both have Vercel-ready configs (`frontend/vercel.json`,
   `backend/vercel.json` + `backend/api/index.js`).
3. **Render web service — STILL BLOCKED, retried 2026-11-16.** Render
   deploys a web service only from a Git repository or a prebuilt
   Docker image. GitHub is now connected as `navassssss`, but creating
   the `travelfix` repo via the API failed 403 "Resource not accessible
   by integration", and the repo still does not exist (public GitHub
   API returns 404 for `navassssss/travelfix`). The Zakat repo
   `navassssss/travel-problems` was not touched. Unblock: the user must
   create the repo manually on github.com, then the codebase can be
   pushed and the Render service created from it with `render.yaml`,
   or a Docker image can be built from `backend/Dockerfile` and
   deployed as an image-backed service.

## Honest limits

- Google Sign-In and email OTP are shown as not yet connected. Name + email
  is the working account.
- Free Render web services sleep after 15 minutes of inactivity.
- Free Render Postgres expires 2026-12-16 (see above).
- The seed data includes 5 verified generic resources and 3 published
  community solutions labelled as personal experience.

## AI plans (Gemini, free tier)

Problem solving uses Google Gemini (`gemini-3.5-flash-lite`, free tier) when
`GEMINI_API_KEY` is set in the backend environment (Render: Environment tab).
The model is grounded: it may only use the traveller's own words, published
community solutions and verified resources from the database, and it must
never invent phone numbers, addresses, official contacts, opening hours,
prices or availability. Emergency categories lead with official help.

If the key is unset or the Gemini call fails for any reason, the backend
falls back to the template plan in `src/plan.js` — a case submission never
fails because the AI is unavailable. The same grounding and fallback apply
to follow-up replies (`src/ai.js`).
