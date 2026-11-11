import { z } from "zod";
import { MAX_SESSION_MINUTES, subjects, voices } from "@/constants";

const voiceOptions = Object.keys(voices) as [keyof typeof voices, ...(keyof typeof voices)[]];
const styleOptions = Object.keys(voices.male) as [keyof typeof voices.male, ...(keyof typeof voices.male)[]];

// Shared by the companion form (client) and createCompanion (server), so the server
// never trusts input that only passed client-side validation.
export const companionSchema = z.object({
    name: z.string().trim().min(1, { message: 'Companion is required.'}).max(100),
    subject: z.enum(subjects, { message: 'Subject is required.'}),
    topic: z.string().trim().min(1, { message: 'Topic is required.'}).max(500),
    voice: z.enum(voiceOptions, { message: 'Voice is required.'}),
    style: z.enum(styleOptions, { message: 'Style is required.'}),
    duration: z.coerce.number<number | string>().int().min(1, { message: 'Duration is required.'}).max(MAX_SESSION_MINUTES, { message: `Sessions can be at most ${MAX_SESSION_MINUTES} minutes.`}),
});

// What the form holds before validation (duration may still be a string) ...
export type CompanionFormValues = z.input<typeof companionSchema>;
// ... and the validated, coerced value the server receives.
export type CompanionInput = z.output<typeof companionSchema>;

// Transcripts come from the browser, so cap their size before they reach the database
// or the summary model. System messages are dropped by the client.
export const MAX_TRANSCRIPT_MESSAGES = 300;
export const MAX_MESSAGE_LENGTH = 2000;

export const transcriptSchema = z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
})).max(MAX_TRANSCRIPT_MESSAGES);
