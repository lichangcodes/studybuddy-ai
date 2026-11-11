'use server';

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseClient } from "@/lib/supabase";

// Whether the signed-in user gets an email after each lesson. No row yet means the
// default, which is on.
export const getSummaryEmailsEnabled = async (): Promise<boolean> => {
    const { userId } = await auth();
    if(!userId) return false;

    const { data, error } = await createSupabaseClient()
        .from('email_preferences')
        .select('summary_emails')
        .eq('user_id', userId)
        .maybeSingle();

    if(error) throw new Error(error.message);
    return data?.summary_emails ?? true;
};

export const setSummaryEmails = async (enabled: boolean): Promise<{ success: boolean }> => {
    const { userId } = await auth();
    if(!userId || typeof enabled !== 'boolean') return { success: false };

    const { error } = await createSupabaseClient()
        .from('email_preferences')
        .upsert(
            { user_id: userId, summary_emails: enabled, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' },
        );

    if(error) {
        console.error('Updating email preference failed', error);
        return { success: false };
    }

    revalidatePath('/my-journey');
    return { success: true };
};

// The unsubscribe link works without signing in: the token in the link identifies
// the user, and the database function only ever turns emails off.
export const unsubscribeWithToken = async (token: string): Promise<{ success: boolean }> => {
    const parsed = z.uuid().safeParse(token);
    if(!parsed.success) return { success: false };

    const { data, error } = await createSupabaseClient()
        .rpc('unsubscribe_summary_emails', { token: parsed.data });

    if(error) {
        console.error('Unsubscribe failed', error);
        return { success: false };
    }
    return { success: data === true };
};
