import { createElement } from "react";
import { render } from "@react-email/render";
import { Resend } from "resend";
import LessonSummaryEmail, { lessonSummarySubject, type LessonSummaryEmailProps } from "@/lib/email/LessonSummaryEmail";

// Server-only: reads RESEND_API_KEY.

// Without a verified domain, Resend only accepts its shared test sender, which can
// only deliver to the Resend account's own address. Set EMAIL_FROM to an address on
// a verified domain to email every user.
const DEFAULT_FROM = "StudyBuddy AI <onboarding@resend.dev>";

let client: Resend | null = null;
const getClient = () => (client ??= new Resend(process.env.RESEND_API_KEY));

export const isEmailConfigured = () => Boolean(process.env.RESEND_API_KEY);

// Absolute URLs for links in emails. Vercel sets VERCEL_PROJECT_PRODUCTION_URL
// (without a scheme); APP_URL overrides it, e.g. for a custom domain.
export const appUrl = (path: string) => {
    const base = process.env.APP_URL
        ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
        ?? "http://localhost:3000";
    return new URL(path, base).toString();
};

export const unsubscribeUrl = (token: string) => appUrl(`/unsubscribe?token=${encodeURIComponent(token)}`);

// Returns the Resend message id; throws with Resend's message when the send fails.
export const sendLessonSummaryEmail = async ({ to, idempotencyKey, unsubscribeToken, ...props }:
    Omit<LessonSummaryEmailProps, "unsubscribeUrl"> & { to: string; idempotencyKey: string; unsubscribeToken: string }
): Promise<string> => {
    const link = unsubscribeUrl(unsubscribeToken);
    const email = createElement(LessonSummaryEmail, { ...props, unsubscribeUrl: link });

    const [html, text] = await Promise.all([render(email), render(email, {
        plainText: true,
        // The hidden inbox preview would otherwise repeat the overview at the top.
        htmlToTextOptions: { selectors: [{ selector: "[data-preview]", format: "skip" }] },
    })]);

    const { data, error } = await getClient().emails.send({
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to,
        subject: lessonSummarySubject(props.topic),
        html,
        text,
        headers: {
            // Lets mail clients show their own unsubscribe button. The POST variant
            // (RFC 8058) is served by app/api/unsubscribe/route.ts.
            "List-Unsubscribe": `<${appUrl(`/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`)}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        tags: [{ name: "kind", value: "lesson_summary" }],
    }, { idempotencyKey });

    if(error || !data) throw new Error(error?.message ?? "Resend returned no message id");
    return data.id;
};
