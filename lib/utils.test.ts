import { describe, expect, it } from "vitest";
import { quoteFilterValue } from "@/lib/utils";

describe("quoteFilterValue", () => {
    it("wraps the value in double quotes", () => {
        expect(quoteFilterValue("%maths%")).toBe('"%maths%"');
    });

    it("keeps PostgREST delimiters inside the quotes", () => {
        expect(quoteFilterValue("a,b.c(d)")).toBe('"a,b.c(d)"');
    });

    it("escapes quotes and backslashes so the value cannot close the quotes", () => {
        expect(quoteFilterValue('say "hi"')).toBe('"say \\"hi\\""');
        expect(quoteFilterValue("back\\slash")).toBe('"back\\\\slash"');
        expect(quoteFilterValue('\\"')).toBe('"\\\\\\""');
    });
});
