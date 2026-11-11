import { currentUser } from "@clerk/nextjs/server";
import { createSupabaseClient } from "@/lib/supabase";
import { appUrl, isEmailConfigured, sendLessonSummaryEmail } from "@/lib/email/send";
import type { SessionSummary } from "@/lib/summary";

// Server-only. Both steps run as the signed-in user, so RLS applies to every query.

export type PreparedEmail = { to: string; firstName: string | null; unsubscribeToken: string };

// Whether to email this user, and where. Null when email is not configured, the user
// turned summary emails off, or Clerk has no address for them.
export const prepareLessonSummaryEmail = async (userId: string): Promise<PreparedEmail | null> => {
    if(!isEmailConfigured()) return null;

    const supabase = createSupabaseClient();

    // First lesson: create the row with the default (on) and a fresh unsubscribe token.
    const { error: upsertError } = await supabase
        .from('email_preferences')
        .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
    if(upsertError) throw new Error(upsertError.message);

    const { data: preference, error } = await supabase
        .from('email_preferences')
        .select('summary_emails, unsubscribe_token')
        .eq('user_id', userId)
        .single();
    if(error) throw new Error(error.message);
    if(!preference.summary_emails) return null;

    const user = await currentUser();
    const to = user?.primaryEmailAddress?.emailAddress;
    if(!to) return null;

    return { to, firstName: user.firstName, unsubscribeToken: preference.unsubscribe_token };
};

// Sends the email and records the outcome in email_log. Never throws: it runs after
// the response has gone out, where nobody could handle the error.
export const sendAndLogLessonSummaryEmail = async ({ email, userId, sessionId, companion, summary }: {
    email: PreparedEmail;
    userId: string;
    sessionId: string;
    companion: { id: string; name: string; topic: string };
    summary: SessionSummary;
}) => {
    let entry: { status: 'sent' | 'failed'; provider_message_id?: string; error?: string };
    try {
        const id = await sendLessonSummaryEmail({
            to: email.to,
            unsubscribeToken: email.unsubscribeToken,
            // Resend drops a repeat of the same key, so a retried request can't send twice.
            idempotencyKey: `lesson-summary/${sessionId}`,
            firstName: email.firstName,
            companionName: companion.name,
            topic: companion.topic,
            summary,
            lessonUrl: appUrl(`/companions/${companion.id}`),
        });
        entry = { status: 'sent', provider_message_id: id };
    } catch(e) {
        // Without a verified domain, Resend rejects every recipient except the
        // account owner; that shows up here as a failed send.
        entry = { status: 'failed', error: (e instanceof Error ? e.message : String(e)).slice(0, 500) };
        console.error('Lesson summary email failed', e);
    }

    const { error } = await createSupabaseClient()
        .from('email_log')
        .insert({ user_id: userId, session_id: sessionId, kind: 'lesson_summary', ...entry });
    if(error) console.error('Logging lesson summary email failed', error);
};
