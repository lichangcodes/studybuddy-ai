import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentUser } from "@clerk/nextjs/server";
import { isEmailConfigured, sendLessonSummaryEmail } from "@/lib/email/send";
import { mockSupabase } from "@/lib/test/server-mocks";
import { prepareLessonSummaryEmail, sendAndLogLessonSummaryEmail } from "@/lib/email/deliver";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createSupabaseClient: vi.fn() }));
vi.mock("@/lib/email/send", () => ({
    isEmailConfigured: vi.fn(),
    sendLessonSummaryEmail: vi.fn(),
    appUrl: (path: string) => `https://app.test${path}`,
}));

const user = { firstName: "Ada", primaryEmailAddress: { emailAddress: "ada@example.com" } };

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isEmailConfigured).mockReturnValue(true);
    vi.mocked(currentUser).mockResolvedValue(user as never);
});

describe("prepareLessonSummaryEmail", () => {
    it("creates the preference row on first use and returns the address and token", async () => {
        const calls = mockSupabase({
            email_preferences: [{ data: null }, { data: { summary_emails: true, unsubscribe_token: "tok" } }],
        });

        expect(await prepareLessonSummaryEmail("user_1")).toEqual({ to: "ada@example.com", firstName: "Ada", unsubscribeToken: "tok" });

        const upsert = calls.callsTo("email_preferences", "upsert")[0];
        // Only the user id: an existing choice is never overwritten.
        expect(upsert.args).toEqual([{ user_id: "user_1" }, { onConflict: "user_id", ignoreDuplicates: true }]);
    });

    it("returns null when the user turned summary emails off", async () => {
        mockSupabase({ email_preferences: [{ data: null }, { data: { summary_emails: false, unsubscribe_token: "tok" } }] });

        expect(await prepareLessonSummaryEmail("user_1")).toBeNull();
        expect(currentUser).not.toHaveBeenCalled();
    });

    it("returns null without touching the database when email is not configured", async () => {
        vi.mocked(isEmailConfigured).mockReturnValue(false);
        const calls = mockSupabase();

        expect(await prepareLessonSummaryEmail("user_1")).toBeNull();
        expect(calls.calls).toHaveLength(0);
    });

    it("returns null when Clerk has no email address", async () => {
        mockSupabase({ email_preferences: [{ data: null }, { data: { summary_emails: true, unsubscribe_token: "tok" } }] });
        vi.mocked(currentUser).mockResolvedValue({ firstName: "Ada", primaryEmailAddress: null } as never);

        expect(await prepareLessonSummaryEmail("user_1")).toBeNull();
    });
});

describe("sendAndLogLessonSummaryEmail", () => {
    const args = {
        email: { to: "ada@example.com", firstName: "Ada", unsubscribeToken: "tok" },
        userId: "user_1",
        sessionId: "s1",
        companion: { id: "c1", name: "SQL master", topic: "SQL basics" },
        summary: { overview: "o", key_points: [], review_questions: [], next_steps: [] },
    };

    it("sends once per session and logs the message id", async () => {
        const calls = mockSupabase();
        vi.mocked(sendLessonSummaryEmail).mockResolvedValue("msg_1");

        await sendAndLogLessonSummaryEmail(args);

        expect(sendLessonSummaryEmail).toHaveBeenCalledWith(expect.objectContaining({
            to: "ada@example.com",
            idempotencyKey: "lesson-summary/s1",
            lessonUrl: "https://app.test/companions/c1",
        }));
        expect(calls.callsTo("email_log", "insert")[0].args[0]).toEqual({
            user_id: "user_1", session_id: "s1", kind: "lesson_summary", status: "sent", provider_message_id: "msg_1",
        });
    });

    it("logs a failed send instead of throwing", async () => {
        const calls = mockSupabase();
        vi.mocked(sendLessonSummaryEmail).mockRejectedValue(new Error("You can only send testing emails to your own email address"));
        vi.spyOn(console, "error").mockImplementation(() => {});

        await expect(sendAndLogLessonSummaryEmail(args)).resolves.toBeUndefined();

        expect(calls.callsTo("email_log", "insert")[0].args[0]).toMatchObject({
            status: "failed", error: "You can only send testing emails to your own email address",
        });
    });
});
