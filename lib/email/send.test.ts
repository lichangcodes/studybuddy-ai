import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));

import { appUrl, sendLessonSummaryEmail } from "@/lib/email/send";

const summary = {
    overview: "You learned SELECT.",
    key_points: ["SELECT picks columns", "<b>FROM</b> picks the table"],
    review_questions: ["What does FROM do?"],
    next_steps: [],
};
const email = {
    to: "ada@example.com",
    idempotencyKey: "lesson-summary/s1",
    unsubscribeToken: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
    firstName: "Ada",
    companionName: "SQL master",
    topic: "SQL basics",
    summary,
    lessonUrl: "https://app.test/companions/c1",
};

beforeEach(() => {
    send.mockReset();
    vi.unstubAllEnvs();
    vi.stubEnv("APP_URL", "https://app.test");
    vi.stubEnv("EMAIL_FROM", "");
});

describe("appUrl", () => {
    it("prefers APP_URL, then Vercel's production URL", () => {
        expect(appUrl("/x")).toBe("https://app.test/x");
        vi.stubEnv("APP_URL", undefined as unknown as string);
        vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "studybuddy.vercel.app");
        expect(appUrl("/x")).toBe("https://studybuddy.vercel.app/x");
    });
});

describe("sendLessonSummaryEmail", () => {
    it("sends HTML and plain text with unsubscribe headers and an idempotency key", async () => {
        send.mockResolvedValue({ data: { id: "msg_1" }, error: null });

        expect(await sendLessonSummaryEmail(email)).toBe("msg_1");

        const [payload, options] = send.mock.calls[0];
        expect(options).toEqual({ idempotencyKey: "lesson-summary/s1" });
        expect(payload).toMatchObject({
            from: "StudyBuddy AI <onboarding@resend.dev>",
            to: "ada@example.com",
            subject: "Your lesson summary: SQL basics",
            headers: {
                "List-Unsubscribe": "<https://app.test/api/unsubscribe?token=1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed>",
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
        });
        expect(payload.html).toContain("Hi Ada, here is what you covered with SQL master.");
        expect(payload.html).toContain("https://app.test/unsubscribe?token=1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed");
        expect(payload.html).toContain('href="https://app.test/companions/c1"');
        // Model output is text, never markup.
        expect(payload.html).toContain("&lt;b&gt;FROM&lt;/b&gt; picks the table");
        // Empty sections are left out.
        expect(payload.html).not.toContain("Next steps");
        expect(payload.text).toContain("SELECT picks columns");
        expect(payload.text).not.toContain("<td");
        expect(payload.text.match(/You learned SELECT\./g)).toHaveLength(1);
    });

    it("uses EMAIL_FROM when set", async () => {
        vi.stubEnv("EMAIL_FROM", "StudyBuddy <hello@studybuddy.dev>");
        send.mockResolvedValue({ data: { id: "msg_1" }, error: null });

        await sendLessonSummaryEmail(email);

        expect(send.mock.calls[0][0].from).toBe("StudyBuddy <hello@studybuddy.dev>");
    });

    it("throws Resend's error message", async () => {
        send.mockResolvedValue({ data: null, error: { message: "You can only send testing emails to your own email address" } });

        await expect(sendLessonSummaryEmail(email)).rejects.toThrow("only send testing emails");
    });
});
