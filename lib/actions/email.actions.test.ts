import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockSupabase, signIn, signOut } from "@/lib/test/server-mocks";
import { getSummaryEmailsEnabled, setSummaryEmails, unsubscribeWithToken } from "@/lib/actions/email.actions";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createSupabaseClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const token = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";

beforeEach(() => {
    vi.clearAllMocks();
});

describe("getSummaryEmailsEnabled", () => {
    it("defaults to on before the user has a preference row", async () => {
        signIn("user_1");
        mockSupabase({ email_preferences: [{ data: null }] });

        expect(await getSummaryEmailsEnabled()).toBe(true);
    });

    it("returns the stored choice", async () => {
        signIn("user_1");
        mockSupabase({ email_preferences: [{ data: { summary_emails: false } }] });

        expect(await getSummaryEmailsEnabled()).toBe(false);
    });
});

describe("setSummaryEmails", () => {
    it("rejects signed-out users without touching the database", async () => {
        signOut();
        const calls = mockSupabase();

        expect(await setSummaryEmails(false)).toEqual({ success: false });
        expect(calls.calls).toHaveLength(0);
    });

    it("upserts only the user's own choice", async () => {
        signIn("user_1");
        const calls = mockSupabase();

        expect(await setSummaryEmails(false)).toEqual({ success: true });

        const [row, options] = calls.callsTo("email_preferences", "upsert")[0].args as [Record<string, unknown>, unknown];
        expect(row).toMatchObject({ user_id: "user_1", summary_emails: false });
        expect(Object.keys(row).sort()).toEqual(["summary_emails", "updated_at", "user_id"]);
        expect(options).toEqual({ onConflict: "user_id" });
    });

    it("rejects non-boolean input", async () => {
        signIn("user_1");
        const calls = mockSupabase();

        expect(await setSummaryEmails("false" as never)).toEqual({ success: false });
        expect(calls.calls).toHaveLength(0);
    });
});

describe("unsubscribeWithToken", () => {
    it("rejects malformed tokens without calling the database", async () => {
        const calls = mockSupabase();

        expect(await unsubscribeWithToken("not-a-uuid")).toEqual({ success: false });
        expect(calls.calls).toHaveLength(0);
    });

    it("unsubscribes through the database function, signed in or not", async () => {
        signOut();
        const calls = mockSupabase({ "rpc:unsubscribe_summary_emails": [{ data: true }] });

        expect(await unsubscribeWithToken(token)).toEqual({ success: true });
        expect(calls.callsTo("rpc:unsubscribe_summary_emails", "rpc")[0].args).toEqual([{ token }]);
    });

    it("reports an unknown token", async () => {
        mockSupabase({ "rpc:unsubscribe_summary_emails": [{ data: false }] });

        expect(await unsubscribeWithToken(token)).toEqual({ success: false });
    });
});
