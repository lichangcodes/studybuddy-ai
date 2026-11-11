import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

// Server-only: shared by the lesson summary and the demo lesson. It reads
// GEMINI_API_KEY, so client components must not import it.

// Free tier of the Gemini API. Free-tier prompts may be used by Google to improve
// its products; switch to a paid key before handling real user data.
// Flash-Lite rather than Flash: these tasks are easy for it, and the free tier's
// Flash models were often unavailable (503 "high demand").
export const GEMINI_MODEL = "gemini-3.5-flash-lite";

const ATTEMPT_TIMEOUT_MS = 20_000;
// Free-tier 503s usually clear within seconds, so retry those quickly. The SDK's
// own backoff waits far longer than a student on the page would.
export const RETRY_DELAYS_MS = [1_000, 2_000, 3_000];

let client: GoogleGenAI | null = null;
const getClient = () => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

export const isGeminiConfigured = () => Boolean(process.env.GEMINI_API_KEY);

// JSON schema for structured output, from the same zod schema that validates it.
export const toResponseSchema = (schema: z.ZodType) => {
    const json = z.toJSONSchema(schema);
    delete json.$schema;
    return json;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Server errors (5xx) are retried; anything else (bad request, rate limit, timeout)
// is thrown at once, as is the last error once the retries or the deadline run out.
const withRetries = async <T>(deadline: number, attempt: (timeoutMs: number) => Promise<T>): Promise<T> => {
    for(let i = 0; ; i++) {
        try {
            return await attempt(Math.min(ATTEMPT_TIMEOUT_MS, deadline - Date.now()));
        } catch(e) {
            const status = (e as { status?: unknown })?.status;
            const retryable = typeof status === "number" && status >= 500;
            const delay = RETRY_DELAYS_MS[i];
            // Leave at least a few seconds for the next attempt to succeed.
            if(!retryable || delay === undefined || Date.now() + delay + 5_000 > deadline) throw e;
            await sleep(delay);
        }
    }
};

// One structured-output request. Returns null when the model returns nothing usable
// (blocked by safety filters, or output that does not match the schema); API and
// network errors throw once retries are exhausted.
export const generateJson = async <S extends z.ZodType>({ schema, systemInstruction, input, deadlineMs }: {
    schema: S;
    systemInstruction: string;
    input: string;
    deadlineMs: number;
}): Promise<z.output<S> | null> => {
    const request = {
        model: GEMINI_MODEL,
        system_instruction: systemInstruction,
        input,
        response_format: { type: "text", mime_type: "application/json", schema: toResponseSchema(schema) },
        // Anything worth keeping is stored in our own database; Google doesn't need it.
        store: false,
    } as const;

    const deadline = Date.now() + deadlineMs;
    const interaction = await withRetries(deadline, (timeout_ms) =>
        getClient().interactions.create(request, { timeout_ms, retries: { strategy: "none" } })
    );

    if(!interaction.output_text) return null;

    try {
        const parsed = schema.safeParse(JSON.parse(interaction.output_text));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
};
