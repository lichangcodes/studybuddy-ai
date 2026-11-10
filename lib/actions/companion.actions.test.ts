import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createSupabaseClient } from "@/lib/supabase";
import {
    addBookmark,
    createCompanion,
    getAllCompanions,
    getCompanion,
    getRecentSessions,
    newCompanionPermissions,
} from "@/lib/actions/companion.actions";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createSupabaseClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type QueryResult = { data?: unknown; error?: { code?: string; message: string } | null; count?: number | null };
type Call = { table: string; method: string; args: unknown[] };

// Minimal stand-in for the Supabase query builder: every method call is recorded and
// chains, and awaiting the query yields the next queued result for that table.
const mockSupabase = (results: Record<string, QueryResult[]> = {}) => {
    const calls: Call[] = [];

    const query = (table: string): unknown => {
        const result = { data: null, error: null, count: null, ...results[table]?.shift() };
        const builder: unknown = new Proxy({}, {
            get(_target, prop) {
                if(prop === "then") {
                    return (resolve: (r: QueryResult) => unknown, reject: (e: unknown) => unknown) =>
                        Promise.resolve(result).then(resolve, reject);
                }
                return (...args: unknown[]) => {
                    calls.push({ table, method: String(prop), args });
                    return builder;
                };
            },
        });
        return builder;
    };

    const client = {
        from: (table: string) => query(table),
        rpc: (fn: string, args: unknown) => {
            calls.push({ table: `rpc:${fn}`, method: "rpc", args: [args] });
            return query(`rpc:${fn}`);
        },
    };
    vi.mocked(createSupabaseClient).mockReturnValue(client as never);

    return {
        calls,
        callsTo: (table: string, method: string) =>
            calls.filter((c) => c.table === table && c.method === method),
    };
};

// Clerk's has() answers plan and feature checks; grant only what is listed.
const signIn = (userId: string, access: { plan?: string; feature?: string } = {}) => {
    const has = (check: { plan?: string; feature?: string }) =>
        (check.plan !== undefined && check.plan === access.plan) ||
        (check.feature !== undefined && check.feature === access.feature);
    vi.mocked(auth).mockResolvedValue({ userId, has } as never);
};

const signOut = () => {
    vi.mocked(auth).mockResolvedValue({ userId: null, has: () => false } as never);
};

const validCompanion = {
    name: "Neura",
    subject: "science",
    topic: "Neural networks",
    voice: "female",
    style: "casual",
    duration: 10,
} as const;

beforeEach(() => {
    vi.clearAllMocks();
});

describe("newCompanionPermissions", () => {
    it("denies signed-out users without querying", async () => {
        signOut();
        const db = mockSupabase();

        expect(await newCompanionPermissions()).toBe(false);
        expect(db.calls).toHaveLength(0);
    });

    it("allows the pro plan without counting companions", async () => {
        signIn("user_1", { plan: "pro" });
        const db = mockSupabase();

        expect(await newCompanionPermissions()).toBe(true);
        expect(db.calls).toHaveLength(0);
    });

    it.each([
        ["3_companion_limit", 2, true],
        ["3_companion_limit", 3, false],
        ["10_companion_limit", 9, true],
        ["10_companion_limit", 10, false],
    ])("with %s and %i companions returns %s", async (feature, count, expected) => {
        signIn("user_1", { feature });
        const db = mockSupabase({ companions: [{ count }] });

        expect(await newCompanionPermissions()).toBe(expected);
        // Counts in the database instead of fetching rows, scoped to the current user.
        expect(db.callsTo("companions", "select")[0].args).toEqual(["id", { count: "exact", head: true }]);
        expect(db.callsTo("companions", "eq")[0].args).toEqual(["author", "user_1"]);
    });

    it("denies users without a plan feature", async () => {
        signIn("user_1");
        mockSupabase({ companions: [{ count: 0 }] });

        expect(await newCompanionPermissions()).toBe(false);
    });
});

describe("createCompanion", () => {
    it("rejects signed-out users", async () => {
        signOut();
        const db = mockSupabase();

        const result = await createCompanion(validCompanion);

        expect(result.success).toBe(false);
        expect(db.calls).toHaveLength(0);
    });

    it("rejects invalid input before touching the database", async () => {
        signIn("user_1", { plan: "pro" });
        const db = mockSupabase();

        const result = await createCompanion({ ...validCompanion, subject: "astrology" } as never);

        expect(result).toEqual({ success: false, error: "Invalid companion details." });
        expect(db.calls).toHaveLength(0);
    });

    it("enforces the plan limit on the server", async () => {
        signIn("user_1", { feature: "3_companion_limit" });
        const db = mockSupabase({ companions: [{ count: 3 }] });

        const result = await createCompanion(validCompanion);

        expect(result.success).toBe(false);
        expect(db.callsTo("companions", "insert")).toHaveLength(0);
    });

    it("inserts only validated fields, authored by the current user", async () => {
        signIn("user_1", { feature: "3_companion_limit" });
        const db = mockSupabase({ companions: [{ count: 1 }, { data: { id: "c1" } }] });

        const result = await createCompanion({
            ...validCompanion,
            name: "  Neura  ",
            id: "attacker-chosen-id",
            author: "someone_else",
            created_at: "2000-01-01",
        } as never);

        expect(result).toEqual({ success: true, data: { id: "c1" } });
        expect(db.callsTo("companions", "insert")[0].args[0]).toEqual({
            ...validCompanion,
            name: "Neura",
            author: "user_1",
        });
    });

    it("returns a generic error when the insert fails", async () => {
        signIn("user_1", { plan: "pro" });
        mockSupabase({ companions: [{ error: { message: "db down" } }] });

        const result = await createCompanion(validCompanion);

        expect(result).toEqual({ success: false, error: "Failed to create a companion." });
    });
});

describe("addBookmark", () => {
    it("does nothing for signed-out users", async () => {
        signOut();
        const db = mockSupabase();

        await addBookmark("c1", "/companions");

        expect(db.calls).toHaveLength(0);
        expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("treats an existing bookmark (unique violation) as success", async () => {
        signIn("user_1");
        mockSupabase({ bookmarks: [{ error: { code: "23505", message: "duplicate key" } }] });

        await expect(addBookmark("c1", "/companions")).resolves.not.toThrow();
        expect(revalidatePath).toHaveBeenCalledWith("/companions");
    });

    it("rethrows other errors", async () => {
        signIn("user_1");
        mockSupabase({ bookmarks: [{ error: { code: "42501", message: "permission denied" } }] });

        await expect(addBookmark("c1", "/companions")).rejects.toThrow("permission denied");
    });
});

describe("getAllCompanions", () => {
    it("quotes the search topic so it cannot change the filter", async () => {
        const db = mockSupabase({ companions: [{ data: [] }] });

        await getAllCompanions({ topic: "a,b),id.not.is.null" });

        expect(db.callsTo("companions", "or")[0].args[0]).toBe(
            'topic.ilike."%a,b),id.not.is.null%",name.ilike."%a,b),id.not.is.null%"'
        );
    });

    it("filters subjects by exact match and paginates", async () => {
        const db = mockSupabase({ companions: [{ data: [] }] });

        await getAllCompanions({ subject: "maths", page: 2, limit: 10 });

        expect(db.callsTo("companions", "eq")[0].args).toEqual(["subject", "maths"]);
        expect(db.callsTo("companions", "range")[0].args).toEqual([10, 19]);
    });
});

describe("getCompanion", () => {
    it("returns null for a malformed id", async () => {
        mockSupabase({ companions: [{ error: { code: "22P02", message: "invalid input syntax for type uuid" } }] });

        expect(await getCompanion("not-a-uuid")).toBeNull();
    });

    it("throws on other errors", async () => {
        mockSupabase({ companions: [{ error: { code: "08006", message: "connection failure" } }] });

        await expect(getCompanion("c1")).rejects.toThrow("connection failure");
    });
});

describe("getRecentSessions", () => {
    it("keeps the session id so repeated companions get unique keys", async () => {
        const companion = { id: "c1", name: "Neura" };
        const db = mockSupabase({
            "rpc:get_recent_sessions": [{ data: [
                { session_id: "s2", companion },
                { session_id: "s1", companion },
            ] }],
        });

        const sessions = await getRecentSessions(5);

        expect(db.callsTo("rpc:get_recent_sessions", "rpc")[0].args).toEqual([{ max_rows: 5 }]);
        expect(sessions.map((s) => s.sessionId)).toEqual(["s2", "s1"]);
        expect(sessions[0]).toMatchObject(companion);
    });
});
