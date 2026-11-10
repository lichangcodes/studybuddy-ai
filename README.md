# StudyBuddy AI

A voice-first AI learning platform. Users build personalized "learning companions" (subject, topic, voice, teaching style) and learn through real-time voice conversations with an AI tutor.

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
