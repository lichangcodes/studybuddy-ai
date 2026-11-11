'use server';

import {auth} from "@clerk/nextjs/server";
import {createSupabaseClient} from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import {companionSchema, transcriptSchema, type CompanionInput} from "@/lib/validations";
import {isSummaryConfigured, summarizeSession, type SessionSummary, type TranscriptMessage} from "@/lib/summary";
import {quoteFilterValue} from "@/lib/utils";

// Every readable companion column. `author` (a Clerk user id) is not readable through
// the API, so queries must list columns instead of using `*`.
const COMPANION_COLUMNS = 'id, created_at, name, subject, topic, style, voice, duration';

type CreateCompanionResult =
    | { success: true; data: { id: string } }
    | { success: false; error: string };

// Returns a result instead of throwing so the form can show the reason;
// Next.js hides thrown error messages from the client in production.
export const createCompanion = async (formData: CompanionInput): Promise<CreateCompanionResult> => {
    const { userId: author } = await auth();
    if(!author) return { success: false, error: 'You must be signed in to create a companion.' };

    const parsed = companionSchema.safeParse(formData);
    if(!parsed.success) return { success: false, error: 'Invalid companion details.' };

    // The new-companion page also checks this, but the action can be called directly,
    // so the limit has to be enforced here too.
    if(!(await newCompanionPermissions())) {
        return { success: false, error: 'You have reached your companion limit. Upgrade your plan to create more.' };
    }

    const supabase = createSupabaseClient();

    // Insert only validated fields so callers cannot set columns like id or created_at.
    const { data, error } = await supabase
        .from('companions')
        .insert({ ...parsed.data, author })
        .select('id')
        .single();

    if(error || !data) return { success: false, error: 'Failed to create a companion.' };

    return { success: true, data };
}

export const getAllCompanions = async ({ limit = 10, page = 1, subject, topic }: GetAllCompanions) => {
    const supabase = createSupabaseClient();

    let query = supabase.from('companions').select(COMPANION_COLUMNS);

    if(subject) {
        query = query.eq('subject', String(subject))
    }
    if(topic) {
        const pattern = quoteFilterValue(`%${topic}%`);
        query = query.or(`topic.ilike.${pattern},name.ilike.${pattern}`)
    }

    query = query.range((page - 1) * limit, page * limit - 1);

    const { data: companions, error } = await query;

    if(error) throw new Error(error.message);

    return companions;
}

export const getCompanion = async (id: string) => {
    const supabase = createSupabaseClient();

    const { data, error } = await supabase
        .from('companions')
        .select(COMPANION_COLUMNS)
        .eq('id', id)
        .maybeSingle();

    // 22P02 = invalid uuid syntax, i.e. a malformed id in the URL: treat as not found.
    if(error?.code === '22P02') return null;
    if(error) throw new Error(error.message);

    return data;
}

// Every summary is a paid model call, so cap how many one user can trigger per day.
const DAILY_SUMMARY_LIMIT = 20;
// Shorter exchanges (a greeting and nothing else) are not worth summarising.
const MIN_SUMMARY_MESSAGES = 4;

type CompleteSessionResult =
    | { success: false; error: string }
    | { success: true; sessionId: string; summary: SessionSummary | null; summaryError?: string };

// Records a finished session, then summarises its transcript with Claude. The session is
// recorded even when the summary is skipped or fails, so history never depends on the model.
export const completeSession = async (companionId: string, transcript: TranscriptMessage[]): Promise<CompleteSessionResult> => {
    const { userId } = await auth();
    if(!userId) return { success: false, error: 'You must be signed in.' };

    const parsed = transcriptSchema.safeParse(transcript);
    if(!parsed.success) return { success: false, error: 'Invalid transcript.' };

    const supabase = createSupabaseClient();

    const { data: session, error } = await supabase
        .from('session_history')
        .insert({ companion_id: companionId, user_id: userId })
        .select('id')
        .single();

    if(error || !session) return { success: false, error: 'Failed to record the session.' };

    const done = (summary: SessionSummary | null, summaryError?: string): CompleteSessionResult =>
        ({ success: true, sessionId: session.id, summary, ...(summaryError && { summaryError }) });

    if(parsed.data.length < MIN_SUMMARY_MESSAGES) return done(null, 'The lesson was too short to summarise.');
    if(!isSummaryConfigured()) return done(null, 'Summaries are not available right now.');

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
        .from('session_summaries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', since);

    if(countError) return done(null, 'Summaries are not available right now.');
    if((count ?? 0) >= DAILY_SUMMARY_LIMIT) return done(null, 'You have reached today\'s summary limit.');

    // Subject and topic come from the database, not the client.
    const companion = await getCompanion(companionId);
    if(!companion) return done(null, 'Summaries are not available right now.');

    let summary: SessionSummary | null;
    try {
        summary = await summarizeSession({ subject: companion.subject, topic: companion.topic, transcript: parsed.data });
    } catch(e) {
        console.error('Session summary failed', e);
        return done(null, 'Could not generate a summary this time.');
    }
    if(!summary) return done(null, 'Could not generate a summary this time.');

    const { error: saveError } = await supabase
        .from('session_summaries')
        .insert({ session_id: session.id, user_id: userId, transcript: parsed.data, summary });

    if(saveError) console.error('Saving session summary failed', saveError);

    return done(summary);
}

export const getRecentSessions = async (limit = 10) => {
    const supabase = createSupabaseClient();
    // Session rows are private under RLS; this function returns each companion's latest
    // session across all users without exposing who ran them or who wrote the companion.
    const { data, error } = await supabase
        .rpc('get_recent_sessions', { max_rows: limit })

    if(error) throw new Error(error.message);

    return (data as { session_id: string; companion: Companion }[])
        .map(({ session_id, companion }) => ({ ...companion, sessionId: session_id }));
}

export const getUserSessions = async (userId: string, limit = 10) => {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
        .from('session_history')
        .select(`id, companions:companion_id (${COMPANION_COLUMNS})`)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)

    if(error) throw new Error(error.message);

    return data.map(({ id, companions }) => ({ ...companions, sessionId: id }));
}

export const getUserSessionCount = async (userId: string) => {
    const supabase = createSupabaseClient();
    const { count, error } = await supabase
        .from('session_history')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)

    if(error) throw new Error(error.message);

    return count ?? 0;
}

// Companions created by the signed-in user. The database resolves the user from the
// session token, since the author column is not readable through the API.
export const getMyCompanions = async () => {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase.rpc('get_my_companions');

    if(error) throw new Error(error.message);

    return data;
}

export const newCompanionPermissions = async () => {
    const { userId, has } = await auth();
    if(!userId) return false;

    let limit = 0;

    if(has({ plan: 'pro' })) {
        return true;
    } else if(has({ feature: "3_companion_limit" })) {
        limit = 3;
    } else if(has({ feature: "10_companion_limit" })) {
        limit = 10;
    }

    const supabase = createSupabaseClient();

    const { data: count, error } = await supabase.rpc('count_my_companions');

    if(error) throw new Error(error.message);

    return Number(count ?? 0) < limit;
}

// Bookmarks
export const addBookmark = async (companionId: string, path: string) => {
  const { userId } = await auth();
  if (!userId) return;
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.from("bookmarks").insert({
    companion_id: companionId,
    user_id: userId,
  });
  // 23505 = unique violation: the companion is already bookmarked, which is fine.
  if (error && error.code !== "23505") {
    throw new Error(error.message);
  }
  // Revalidate the path to force a re-render of the page

  revalidatePath(path);
  return data;
};

export const removeBookmark = async (companionId: string, path: string) => {
  const { userId } = await auth();
  if (!userId) return;
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("bookmarks")
    .delete()
    .eq("companion_id", companionId)
    .eq("user_id", userId);
  if (error) {
    throw new Error(error.message);
  }
  revalidatePath(path);
  return data;
};

// Ids of the current user's bookmarked companions, used to render bookmark state on cards.
export const getBookmarkedCompanionIds = async () => {
  const { userId } = await auth();
  if (!userId) return [];
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("bookmarks")
    .select("companion_id")
    .eq("user_id", userId);
  if (error) {
    throw new Error(error.message);
  }
  return data.map(({ companion_id }) => companion_id as string);
};

// It's almost the same as getUserCompanions, but it's for the bookmarked companions
export const getBookmarkedCompanions = async (userId: string) => {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("bookmarks")
    .select(`companions:companion_id (${COMPANION_COLUMNS})`)
    .eq("user_id", userId);
  if (error) {
    throw new Error(error.message);
  }
  // We don't need the bookmarks data, so we return only the companions
  return data.map(({ companions }) => companions);
};
