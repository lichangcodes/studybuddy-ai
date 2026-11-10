import { describe, expect, it } from "vitest";
import { companionSchema } from "@/lib/validations";
import { MAX_SESSION_MINUTES } from "@/constants";

const valid = {
    name: "Neura",
    subject: "science",
    topic: "Neural networks",
    voice: "female",
    style: "casual",
    duration: 15,
};

describe("companionSchema", () => {
    it("accepts a valid companion", () => {
        expect(companionSchema.safeParse(valid).success).toBe(true);
    });

    it("trims text fields and rejects whitespace-only names", () => {
        expect(companionSchema.parse({ ...valid, name: "  Neura  " }).name).toBe("Neura");
        expect(companionSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
    });

    it.each([
        ["subject", "astrology"],
        ["voice", "robot"],
        ["style", "sarcastic"],
    ])("rejects an unknown %s", (field, value) => {
        expect(companionSchema.safeParse({ ...valid, [field]: value }).success).toBe(false);
    });

    it("enforces duration bounds", () => {
        expect(companionSchema.safeParse({ ...valid, duration: 0 }).success).toBe(false);
        expect(companionSchema.safeParse({ ...valid, duration: 1 }).success).toBe(true);
        expect(companionSchema.safeParse({ ...valid, duration: MAX_SESSION_MINUTES }).success).toBe(true);
        expect(companionSchema.safeParse({ ...valid, duration: MAX_SESSION_MINUTES + 1 }).success).toBe(false);
        expect(companionSchema.safeParse({ ...valid, duration: 2.5 }).success).toBe(false);
    });

    it("coerces numeric strings from form inputs", () => {
        expect(companionSchema.parse({ ...valid, duration: "10" }).duration).toBe(10);
    });

    it("strips unknown fields", () => {
        const parsed = companionSchema.parse({ ...valid, id: "x", author: "someone-else" });
        expect(parsed).not.toHaveProperty("id");
        expect(parsed).not.toHaveProperty("author");
    });
});
