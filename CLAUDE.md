# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

StudyBuddy AI — a voice-first AI tutoring app. Users create "companions" (subject, topic, voice, style, duration) and talk to them in real time through Vapi.

## Commands

```bash
npm run dev          # dev server (Turbopack) on http://localhost:3000
npm run build        # production build
npm run lint         # next lint
npx tsc --noEmit     # type check — run this explicitly, see below
```

`next.config.ts` sets `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds`, so `npm run build` succeeds even with type or lint errors. Always run `npx tsc --noEmit` and `npm run lint` to verify changes.

There is no test framework set up yet.

Environment variables are listed in `.env.example` (Clerk, Supabase, Vapi); real values live in `.env.local`.

## Architecture

**Stack:** Next.js 15 App Router + React 19, Clerk (auth and billing), Supabase Postgres, Vapi (voice AI), Tailwind v4 + shadcn/ui.

**No API routes — the backend is Server Actions.** All data access lives in `lib/actions/companion.actions.ts` (`'use server'`). Server components call these directly for reads; client components (e.g. `CompanionForm`, `CompanionComponent`, bookmark buttons) call them for writes. Mutations that change a rendered page call `revalidatePath`.

**Auth flows from Clerk into Supabase.** `lib/supabase.ts` creates a Supabase client per call whose `accessToken` is the current Clerk session token (Clerk ↔ Supabase third-party auth). Any row-level security therefore keys off the Clerk user id (`auth.jwt()->>'sub'`), and rows store Clerk user ids in `author` / `user_id`. `middleware.ts` runs `clerkMiddleware()` without protecting any routes — each page checks `auth()` / `currentUser()` itself and redirects to `/sign-in`.

**Database schema is not in the repo** (it was created in the Supabase dashboard). Tables used by the code:
- `companions` — `id`, `name`, `subject`, `topic`, `voice`, `style`, `duration`, `author`, `created_at`
- `session_history` — `companion_id` → companions, `user_id`, `created_at`
- `bookmarks` — `companion_id` → companions, `user_id`

Joins use PostgREST embedding, e.g. `.select('companions:companion_id (*)')`.

**Plan limits come from Clerk Billing.** `newCompanionPermissions()` checks `has({ plan: 'pro' })` and the features `3_companion_limit` / `10_companion_limit`, then counts the user's companions. It is only called when rendering `app/companions/new/page.tsx`; `createCompanion` does not enforce it. `/subscription` renders Clerk's `<PricingTable />`.

**Voice session flow** (`components/CompanionComponent.tsx`):
- `lib/vapi.sdk.ts` exports a single client-side `Vapi` instance.
- `configureAssistant(voice, style)` in `lib/utils.ts` builds a transient assistant (Deepgram STT → OpenAI → ElevenLabs TTS). The system prompt uses `{{topic}}`, `{{subject}}`, `{{style}}` placeholders, which are filled by `variableValues` passed to `vapi.start`.
- Voice IDs come from the `voices` map in `constants/index.ts`, keyed by voice (`male`/`female`) and style (`casual`/`formal`).
- Final transcript messages are kept in component state only (not persisted). On `call-end`, a row is written to `session_history`.

**Subjects are defined in several places that must stay in sync:** `subjects` and `subjectsColors` in `constants/index.ts`, and an icon at `public/icons/<subject>.svg` (loaded by name). The `Subject` enum in `types/index.d.ts` is out of date.

**Types are global ambient declarations** in `types/index.d.ts` (`CreateCompanion`, `GetAllCompanions`, `SearchParams`, `CompanionComponentProps`, …) and are used without imports. The `Companion` type there is a leftover referencing Appwrite `Models` and does not match the Supabase rows.

**Styling:** shared component classes (`.companion-card`, `.btn-primary`, `.navbar`, `.transcript`, …) are defined in `app/globals.css` under `@layer components`; prefer reusing them. shadcn/ui primitives are in `components/ui/`.

**URL search state:** the companion library filters (`subject`, `topic`) live in the query string; `SearchInput` (debounced) and `SubjectFilter` update it via helpers in `lib/url.ts`, and `app/companions/page.tsx` reads them from `searchParams`.

## Working conventions

Keep each fix or feature in its own commit so the git history shows each change separately.
