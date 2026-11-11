# StudyBuddy AI

A voice-first AI learning platform. Users build personalized "learning companions" (subject, topic, voice, teaching style) and learn through real-time voice conversations with an AI tutor.

**Live demo:** https://studybuddy-ai-ael8.vercel.app (voice sessions are simulated in the demo, so no microphone is needed)

## Features

- **Real-time voice tutoring** — speech-to-text, LLM, and text-to-speech through Vapi, with a live transcript
- **Companion builder** — create tutors with a custom subject, topic, voice, style, and session length
- **Library with search and filters** — filter by subject and search by topic or name
- **Learning journey** — session history, bookmarks, and the companions you created
- **Subscription plans** — plan-based limits on how many companions a user can create (Clerk Billing)

## Tech Stack

| Layer | Tools |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui |
| Backend | Next.js Server Actions |
| Database | Supabase (PostgreSQL) |
| Auth & billing | Clerk |
| Voice AI | Vapi (Deepgram STT, OpenAI LLM, ElevenLabs TTS) |

## Getting Started

```bash
npm install
cp .env.example .env.local   # fill in your keys
npm run dev
```

Then open http://localhost:3000.

Set `NEXT_PUBLIC_VAPI_MOCK=true` to replay a scripted lesson instead of calling Vapi, so sessions can be tried without a microphone or Vapi credits.

## Deployment

The app deploys to Vercel as a standard Next.js project:

1. Import the GitHub repository in Vercel (framework preset: Next.js).
2. Add the variables from `.env.example` under Project Settings → Environment Variables.
3. For a public demo, set `NEXT_PUBLIC_VAPI_MOCK=true`. Visitors get a simulated session and the page says so, and no Vapi credits are spent.
4. Apply the SQL files in `supabase/migrations/` in order in the Supabase SQL Editor, and add the Clerk domain to Supabase's third-party auth settings.
