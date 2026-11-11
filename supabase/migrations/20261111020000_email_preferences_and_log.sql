-- Lesson summary emails: a per-user preference with an unsubscribe token, and a
-- log of every send attempt.

begin;

-- One row per user, created the first time they finish a lesson or change the
-- setting. No row means the default: summary emails on.
create table public.email_preferences (
    user_id varchar primary key,
    summary_emails boolean not null default true,
    -- Secret that lets the unsubscribe link work without signing in.
    unsubscribe_token uuid not null unique default gen_random_uuid(),
    updated_at timestamptz not null default now()
);

alter table public.email_preferences enable row level security;

-- Users can set their own preference, but never choose or change the token.
revoke all on public.email_preferences from anon, authenticated;
grant select on public.email_preferences to authenticated;
grant insert (user_id, summary_emails, updated_at) on public.email_preferences to authenticated;
-- user_id is included because an upsert's ON CONFLICT DO UPDATE sets every column
-- it was given; the policies below still pin it to the signed-in user.
grant update (user_id, summary_emails, updated_at) on public.email_preferences to authenticated;

create policy "Users read their own email preferences"
    on public.email_preferences for select to authenticated
    using (user_id = (select auth.jwt()->>'sub'));

create policy "Users create their own email preferences"
    on public.email_preferences for insert to authenticated
    with check (user_id = (select auth.jwt()->>'sub'));

create policy "Users update their own email preferences"
    on public.email_preferences for update to authenticated
    using (user_id = (select auth.jwt()->>'sub'))
    with check (user_id = (select auth.jwt()->>'sub'));

-- The unsubscribe link: the token alone identifies the user, so this works for
-- anyone holding the link (as an email client's one-click unsubscribe does).
-- Returns false for an unknown token.
create function public.unsubscribe_summary_emails(token uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
    with updated as (
        update public.email_preferences
        set summary_emails = false, updated_at = now()
        where unsubscribe_token = token
        returning 1
    )
    select exists (select 1 from updated);
$$;

revoke execute on function public.unsubscribe_summary_emails(uuid) from public;
grant execute on function public.unsubscribe_summary_emails(uuid) to anon, authenticated;

-- One row per email we tried to send, for debugging and delivery stats.
create table public.email_log (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    user_id varchar not null,
    session_id uuid references public.session_history (id) on delete cascade,
    kind text not null check (kind in ('lesson_summary')),
    status text not null check (status in ('sent', 'failed')),
    provider_message_id text,
    error text,
    -- At most one email of each kind per session.
    unique (session_id, kind)
);

create index email_log_user_created_idx on public.email_log (user_id, created_at desc);

alter table public.email_log enable row level security;

create policy "Users read their own email log"
    on public.email_log for select to authenticated
    using (user_id = (select auth.jwt()->>'sub'));

create policy "Users log emails for their own sessions"
    on public.email_log for insert to authenticated
    with check (
        user_id = (select auth.jwt()->>'sub')
        and exists (
            select 1 from public.session_history s
            where s.id = session_id
              and s.user_id = (select auth.jwt()->>'sub')
        )
    );

commit;
