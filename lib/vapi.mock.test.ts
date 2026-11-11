import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockVapi } from "@/lib/vapi.mock";

const recordEvents = (vapi: MockVapi) => {
    const events: string[] = [];
    for(const name of ["call-start", "speech-start", "speech-end", "call-end"]) {
        vapi.on(name, () => events.push(name));
    }
    vapi.on("message", (m: { role: string; transcript: string }) => events.push(`${m.role}: ${m.transcript}`));
    return events;
};

describe("MockVapi", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("plays a scripted lesson in the same event order as the real client", async () => {
        const vapi = new MockVapi();
        const events = recordEvents(vapi);

        await vapi.start(undefined, { variableValues: { topic: "Derivatives" } });
        vi.runAllTimers();

        expect(events[0]).toBe("call-start");
        expect(events.slice(1, 4)).toEqual([
            "speech-start",
            "speech-end",
            "assistant: Hello, let's start the session. Today we'll be talking about Derivatives.",
        ]);
        expect(events.filter((e) => e.startsWith("user:"))).toHaveLength(2);
        // The lesson stays open until the user ends it.
        expect(events).not.toContain("call-end");
    });

    it("plays a script set for the next session, then goes back to the built-in one", async () => {
        const vapi = new MockVapi();
        const events = recordEvents(vapi);

        vapi.setScript([
            { role: "assistant", text: "SELECT picks columns." },
            { role: "user", text: "And FROM picks the table?" },
        ]);
        await vapi.start();
        vi.runAllTimers();

        expect(events.filter((e) => e.includes(": "))).toEqual([
            "assistant: SELECT picks columns.",
            "user: And FROM picks the table?",
        ]);

        vapi.stop();
        events.length = 0;
        await vapi.start(undefined, { variableValues: { topic: "SQL" } });
        vi.runAllTimers();

        expect(events).toContain("assistant: Hello, let's start the session. Today we'll be talking about SQL.");
    });

    it("emits call-end once on stop and cancels the rest of the script", async () => {
        const vapi = new MockVapi();
        const events = recordEvents(vapi);

        await vapi.start();
        vi.advanceTimersByTime(1000);
        vapi.stop();
        vapi.stop();
        vi.runAllTimers();

        expect(events).toEqual(["call-start", "call-end"]);
    });

    it("does not emit call-end when stopped before starting", () => {
        const vapi = new MockVapi();
        const events = recordEvents(vapi);

        vapi.stop();

        expect(events).toEqual([]);
    });

    it("tracks mute state", () => {
        const vapi = new MockVapi();
        vapi.setMuted(true);
        expect(vapi.isMuted()).toBe(true);
    });
});
