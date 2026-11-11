/* eslint-disable @next/next/no-head-element -- an email document rendered by react-dom, not a Next.js page */
import type { CSSProperties, ReactNode } from "react";
import type { SessionSummary } from "@/lib/summary";

// Email clients ignore stylesheets and much of modern CSS, so this uses tables and
// inline styles only. Rendered to HTML and plain text by lib/email/send.ts.

export type LessonSummaryEmailProps = {
    firstName: string | null;
    companionName: string;
    topic: string;
    summary: SessionSummary;
    lessonUrl: string;
    unsubscribeUrl: string;
};

const colors = { text: "#18181b", muted: "#71717a", border: "#e4e4e7", primary: "#fe5933", background: "#f4f4f5" };
const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const heading: CSSProperties = { margin: "28px 0 8px", fontSize: "17px", fontWeight: 700, color: colors.text };
const paragraph: CSSProperties = { margin: "0 0 12px", fontSize: "15px", lineHeight: "24px", color: colors.text };

const List = ({ items, ordered = false }: { items: string[]; ordered?: boolean }) => {
    const Tag = ordered ? "ol" : "ul";
    return (
        <Tag style={{ margin: 0, paddingLeft: "22px" }}>
            {items.map((item, i) => (
                <li key={i} style={{ ...paragraph, margin: "0 0 6px" }}>{item}</li>
            ))}
        </Tag>
    );
};

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <>
        <h2 style={heading}>{title}</h2>
        {children}
    </>
);

export const lessonSummarySubject = (topic: string) => `Your lesson summary: ${topic}`;

const LessonSummaryEmail = ({ firstName, companionName, topic, summary, lessonUrl, unsubscribeUrl }: LessonSummaryEmailProps) => (
    <html lang="en">
        <head>
            <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>{lessonSummarySubject(topic)}</title>
        </head>
        <body style={{ margin: 0, padding: 0, backgroundColor: colors.background, fontFamily: font }}>
            {/* Inbox preview text; hidden in the message itself. */}
            <div data-preview="" style={{ display: "none", maxHeight: 0, overflow: "hidden" }}>{summary.overview}</div>
            <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ backgroundColor: colors.background }}>
                <tbody><tr><td align="center" style={{ padding: "32px 16px" }}>
                    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}
                        style={{ maxWidth: "560px", backgroundColor: "#ffffff", border: `1px solid ${colors.border}`, borderRadius: "12px" }}>
                        <tbody><tr><td style={{ padding: "32px" }}>
                            <p style={{ ...paragraph, color: colors.primary, fontWeight: 700, margin: "0 0 4px" }}>StudyBuddy AI</p>
                            <h1 style={{ margin: "0 0 20px", fontSize: "24px", lineHeight: "32px", color: colors.text }}>{topic}</h1>

                            <p style={paragraph}>
                                {`${firstName ? `Hi ${firstName}, here` : "Here"} is what you covered with ${companionName}.`}
                            </p>
                            <p style={paragraph}>{summary.overview}</p>

                            {summary.key_points.length > 0 && (
                                <Section title="Key points"><List items={summary.key_points} /></Section>
                            )}
                            {summary.review_questions.length > 0 && (
                                <Section title="Check yourself"><List items={summary.review_questions} ordered /></Section>
                            )}
                            {summary.next_steps.length > 0 && (
                                <Section title="Next steps"><List items={summary.next_steps} /></Section>
                            )}

                            <table role="presentation" cellPadding={0} cellSpacing={0} style={{ marginTop: "28px" }}>
                                <tbody><tr><td style={{ backgroundColor: colors.primary, borderRadius: "8px" }}>
                                    <a href={lessonUrl} style={{ display: "inline-block", padding: "12px 20px", color: "#ffffff", fontSize: "15px", fontWeight: 600, textDecoration: "none" }}>
                                        {`Start another lesson with ${companionName}`}
                                    </a>
                                </td></tr></tbody>
                            </table>
                        </td></tr></tbody>
                    </table>

                    <p style={{ ...paragraph, maxWidth: "560px", margin: "16px auto 0", fontSize: "12px", lineHeight: "18px", color: colors.muted }}>
                        You get this email after each lesson on StudyBuddy AI.{" "}
                        <a href={unsubscribeUrl} style={{ color: colors.muted }}>Unsubscribe from lesson summaries</a>
                    </p>
                </td></tr></tbody>
            </table>
        </body>
    </html>
);

export default LessonSummaryEmail;
