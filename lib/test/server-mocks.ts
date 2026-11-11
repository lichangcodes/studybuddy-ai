import { vi } from "vitest";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseClient } from "@/lib/supabase";

// Shared by server action tests. The test file must mock the modules first:
//   vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
//   vi.mock("@/lib/supabase", () => ({ createSupabaseClient: vi.fn() }));

type QueryResult = { data?: unknown; error?: { code?: string; message: string } | null; count?: number | null };
type Call = { table: string; method: string; args: unknown[] };

// Minimal stand-in for the Supabase query builder: every method call is recorded and
// chains, and awaiting the query yields the next queued result for that table.
export const mockSupabase = (results: Record<string, QueryResult[]> = {}) => {
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
export const signIn = (userId: string, access: { plan?: string; feature?: string } = {}) => {
    const has = (check: { plan?: string; feature?: string }) =>
        (check.plan !== undefined && check.plan === access.plan) ||
        (check.feature !== undefined && check.feature === access.feature);
    vi.mocked(auth).mockResolvedValue({ userId, has } as never);
};

export const signOut = () => {
    vi.mocked(auth).mockResolvedValue({ userId: null, has: () => false } as never);
};

