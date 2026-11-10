'use server';

import {auth} from "@clerk/nextjs/server";
import {createSupabaseClient} from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import {companionSchema, type CompanionInput} from "@/lib/validations";

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

    let query = supabase.from('companions').select();

    if(subject && topic) {
        query = query.ilike('subject', `%${subject}%`)
            .or(`topic.ilike.%${topic}%,name.ilike.%${topic}%`)
    } else if(subject) {
        query = query.ilike('subject', `%${subject}%`)
    } else if(topic) {
        query = query.or(`topic.ilike.%${topic}%,name.ilike.%${topic}%`)
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
        .select()
        .eq('id', id);

    if(error) return console.log(error);

    return data[0];
}

export const addToSessionHistory = async (companionId: string) => {
    const { userId } = await auth();
    const supabase = createSupabaseClient();
    const { data, error } = await supabase.from('session_history')
        .insert({
            companion_id: companionId,
            user_id: userId,
        })

    if(error) throw new Error(error.message);

    return data;
}

export const getRecentSessions = async (limit = 10) => {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
        .from('session_history')
        .select(`id, companions:companion_id (*)`)
        .order('created_at', { ascending: false })
        .limit(limit)

    if(error) throw new Error(error.message);

    // The same companion can appear in several sessions, so keep the session id for list keys.
    return data.map(({ id, companions }) => ({ ...companions, sessionId: id }));
}

export const getUserSessions = async (userId: string, limit = 10) => {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
        .from('session_history')
        .select(`id, companions:companion_id (*)`)
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

export const getUserCompanions = async (userId: string) => {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
        .from('companions')
        .select()
        .eq('author', userId)

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

    // head: true makes Postgres return only the count, not the rows.
    const { count, error } = await supabase
        .from('companions')
        .select('id', { count: 'exact', head: true })
        .eq('author', userId)

    if(error) throw new Error(error.message);

    return (count ?? 0) < limit;
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
  if (error) {
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

// It's almost the same as getUserCompanions, but it's for the bookmarked companions
export const getBookmarkedCompanions = async (userId: string) => {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("bookmarks")
    .select(`companions:companion_id (*)`) // Notice the (*) to get all the companion data
    .eq("user_id", userId);
  if (error) {
    throw new Error(error.message);
  }
  // We don't need the bookmarks data, so we return only the companions
  return data.map(({ companions }) => companions);
};
