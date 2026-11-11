# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

StudyBuddy AI — a voice-first AI tutoring app. Users create "companions" (subject, topic, voice, style, duration) and talk to them in real time through Vapi.

## Commands

```bash
npm run dev          # dev server (Turbopack) on http://localhost:3000
npm run build        # production build
npm run lint         # next lint
npm run typecheck    # tsc --noEmit — run this explicitly, see below
npm test             # Vitest, single run
npm run test:watch   # Vitest, watch mode
npx vitest run lib/actions/companion.actions.test.ts   # one file
npx vitest run -t "enforces the plan limit"            # tests matching a name
```

`next.config.ts` sets `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds`, so `npm run build` succeeds even with type or lint errors. Always run `npm run typecheck`, `npm run lint` and `npm test` to verify changes; CI (`.github/workflows/ci.yml`) runs the same three on every push and PR.

Tests are colocated as `*.test.ts` and run in Node with no network access. Server action tests mock `@clerk/nextjs/server` (`auth`), `@/lib/supabase` and `next/cache`; `mockSupabase()` (with `signIn`/`signOut`) in `lib/test/server-mocks.ts` is a chainable fake query builder that records every call and returns queued results per table. RLS policies are not covered by these tests — they only run in the real database.

Environment variables are listed in `.env.example` (Clerk, Supabase, Vapi); real values live in `.env.local`.

## Architecture

**Stack:** Next.js 15 App Router + React 19, Clerk (auth and billing), Supabase Postgres, Vapi (voice AI), Tailwind v4 + shadcn/ui.

**The backend is Server Actions, not API routes** (the one exception is `app/api/unsubscribe`, which mail clients POST to). Data access lives in `lib/actions/companion.actions.ts` and `lib/actions/email.actions.ts` (`'use server'`). Server components call these directly for reads; client components (e.g. `CompanionForm`, `CompanionComponent`, bookmark buttons) call them for writes. Mutations that change a rendered page call `revalidatePath`.

**Auth flows from Clerk into Supabase.** `lib/supabase.ts` creates a Supabase client per call whose `accessToken` is the current Clerk session token (Clerk ↔ Supabase third-party auth). Any row-level security therefore keys off the Clerk user id (`auth.jwt()->>'sub'`), and rows store Clerk user ids in `author` / `user_id`. `middleware.ts` runs `clerkMiddleware()` without protecting any routes — each page checks `auth()` / `currentUser()` itself and redirects to `/sign-in`.

**Database schema lives in `supabase/migrations/`.** There is no Supabase CLI setup; migrations are applied by pasting them into the Supabase SQL Editor. Add a new timestamped file for every schema change instead of editing applied ones. Tables:
- `companions` — `id`, `name`, `subject`, `topic`, `voice`, `style`, `duration`, `author`, `created_at`. Rows are readable by everyone; insert only as yourself. The `author` column is not readable through the API (column privileges), so queries must select `COMPANION_COLUMNS` instead of `*` (including in embeddings), and the signed-in user's own companions come from the `get_my_companions` / `count_my_companions` functions.
- `session_history` — `companion_id` → companions, `user_id`, `created_at`. Private: read/insert own rows only.
- `bookmarks` — `companion_id` → companions, `user_id`, unique per (user, companion). Private: read/insert/delete own rows only.
- `session_summaries` — `session_id` → session_history (unique), `user_id`, `transcript`, `summary` (jsonb). Private: read own; insert only for your own session.
- `email_preferences` — one row per user: `summary_emails` (default on; no row means on) and a secret `unsubscribe_token`. Users read/insert/update their own row but cannot set or change the token (column privileges). The `unsubscribe_summary_emails(token)` security-definer function, callable by anon, only turns emails off.
- `email_log` — one row per send attempt (`status` sent/failed, Resend message id or error), unique per (session, kind). Read own; insert only for your own session.

RLS policies compare `user_id` / `author` with `auth.jwt()->>'sub'`. Only `email_preferences` has an UPDATE policy, and companions have no DELETE policy — adding those features needs a migration. Because session rows are private, the cross-user "recent sessions" list on the home page goes through the `get_recent_sessions` security-definer function, which returns each companion's latest session and never returns user ids or authors. Supabase grants execute on new functions to `anon` directly, so restricting a function means revoking from `public, anon`.

Joins use PostgREST embedding, e.g. `.select('companions:companion_id (*)')`.

**Summary emails** (`lib/email/`): `completeSession` calls `prepareLessonSummaryEmail` (preference, Clerk address, unsubscribe token) before returning, then sends with `after()` so the student isn't kept waiting; the send is logged in `email_log` and never throws. The template is plain JSX with tables and inline styles (`LessonSummaryEmail.tsx`), rendered to HTML and text with `@react-email/render`. Unsubscribe links go to `/unsubscribe` (a button, since link scanners prefetch URLs) and the `List-Unsubscribe-Post` one-click header to the `app/api/unsubscribe` route handler — the only API route. Without a verified domain, Resend only delivers to the account owner, so other users' sends are logged as failed.

**Plan limits come from Clerk Billing.** `newCompanionPermissions()` checks `has({ plan: 'pro' })` and the features `3_companion_limit` / `10_companion_limit`, then counts the user's companions. It is called when rendering `app/companions/new/page.tsx` and again inside `createCompanion`, so the limit holds even when the action is called directly. `/subscription` renders Clerk's `<PricingTable />`.

**Voice session flow** (`components/CompanionComponent.tsx`):
- `lib/vapi.sdk.ts` exports a single client-side `Vapi` instance. With `NEXT_PUBLIC_VAPI_MOCK=true` it exports `MockVapi` (`lib/vapi.mock.ts`) instead, which replays a scripted lesson with the same events (`call-start`, `speech-*`, `message`, `call-end`) and uses no Vapi credits — prefer it when testing anything that is not the voice pipeline itself. Before starting in mock mode, `CompanionComponent` asks the `getDemoLesson` action for a Gemini-written lesson on the companion's topic (`lib/demo-lesson.ts`) and hands it to the mock via `setDemoScript`; on null it plays the built-in script.
- Gemini calls (summary and demo lesson) go through `generateJson` in `lib/gemini.ts`: one model constant, structured JSON output validated by the same zod schema, `store: false`, and its own retries for 5xx errors within a deadline (the SDK's retries are off because they wait about a minute).
- `configureAssistant(voice, style, duration)` in `lib/utils.ts` builds a transient assistant (Deepgram STT → OpenAI `gpt-4o-mini` → ElevenLabs TTS). Calls end at the companion's duration (capped by `MAX_SESSION_MINUTES`) or after 20s of silence. The system prompt uses `{{topic}}`, `{{subject}}`, `{{style}}` placeholders, which are filled by `variableValues` passed to `vapi.start`.
- Voice IDs come from the `voices` map in `constants/index.ts`, keyed by voice (`male`/`female`) and style (`casual`/`formal`).
- Final transcript messages are kept in component state only (not persisted). On `call-end`, a row is written to `session_history`.

**Subjects are defined in several places that must stay in sync:** `subjects` and `subjectsColors` in `constants/index.ts`, and an icon at `public/icons/<subject>.svg` (loaded by name). The `Subject` enum in `types/index.d.ts` is out of date.

**Types are global ambient declarations** in `types/index.d.ts` (`CreateCompanion`, `GetAllCompanions`, `SearchParams`, `CompanionComponentProps`, …) and are used without imports. The `Companion` type there is a leftover referencing Appwrite `Models` and does not match the Supabase rows.

**Styling:** shared component classes (`.companion-card`, `.btn-primary`, `.navbar`, `.transcript`, …) are defined in `app/globals.css` under `@layer components`; prefer reusing them. shadcn/ui primitives are in `components/ui/`.

**URL search state:** the companion library filters (`subject`, `topic`) live in the query string; `SearchInput` (debounced) and `SubjectFilter` update it via helpers in `lib/url.ts`, and `app/companions/page.tsx` reads them from `searchParams`.

## Working conventions

Keep each fix or feature in its own commit so the git history shows each change separately.
