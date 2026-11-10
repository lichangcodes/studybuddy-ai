import { z } from "zod";
import { subjects, voices } from "@/constants";

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
    duration: z.coerce.number().int().min(1, { message: 'Duration is required.'}).max(120),
});

export type CompanionInput = z.infer<typeof companionSchema>;
