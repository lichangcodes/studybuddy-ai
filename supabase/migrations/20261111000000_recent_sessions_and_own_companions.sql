-- Step 1 of 2 for hiding companions.author from the public API. This migration only
-- adds and replaces functions, so the currently deployed app keeps working. Apply it,
-- deploy the app that uses these functions, then apply
-- 20261111000100_hide_companion_author.sql.

begin;

-- Recent sessions: one row per companion (its latest session) instead of repeating the
-- same companion, and the companion is returned without its author. The shape
-- { session_id, companion } is unchanged so existing callers keep working.
drop function if exists public.get_recent_sessions(int);

create function public.get_recent_sessions(max_rows int default 10)
returns table (session_id uuid, companion jsonb)
language sql
stable
security definer
set search_path = ''
as $$
    select latest.id,
           jsonb_build_object(
               'id', c.id,
               'created_at', c.created_at,
               'name', c.name,
               'subject', c.subject,
               'topic', c.topic,
               'style', c.style,
               'voice', c.voice,
               'duration', c.duration
           )
    from (
        select distinct on (s.companion_id) s.id, s.companion_id, s.created_at
        from public.session_history s
        order by s.companion_id, s.created_at desc
    ) latest
    join public.companions c on c.id = latest.companion_id
    order by latest.created_at desc
    limit least(greatest(max_rows, 0), 50);
$$;

revoke execute on function public.get_recent_sessions(int) from public;
grant execute on function public.get_recent_sessions(int) to anon, authenticated;

-- The signed-in user's own companions. Once the author column is hidden, clients can
-- no longer filter on it, so ownership is resolved here from the session token.
create or replace function public.get_my_companions()
returns table (
    id uuid,
    created_at timestamptz,
    name varchar,
    subject varchar,
    topic varchar,
    style varchar,
    voice varchar,
    duration bigint
)
language sql
stable
security definer
set search_path = ''
as $$
    select c.id, c.created_at, c.name, c.subject, c.topic, c.style, c.voice, c.duration
    from public.companions c
    where c.author = (select auth.jwt()->>'sub')
    order by c.created_at desc;
$$;

create or replace function public.count_my_companions()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
    select count(*)
    from public.companions c
    where c.author = (select auth.jwt()->>'sub');
$$;

-- Supabase grants execute on new functions to anon and authenticated directly, so
-- revoking from public alone would leave anon able to call these.
revoke execute on function public.get_my_companions() from public, anon;
revoke execute on function public.count_my_companions() from public, anon;
grant execute on function public.get_my_companions() to authenticated;
grant execute on function public.count_my_companions() to authenticated;

commit;
