-- Transcript and AI-generated summary for a completed session. One per session,
-- private to the user who ran it.

begin;

create table public.session_summaries (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    session_id uuid not null unique
        references public.session_history (id) on delete cascade,
    user_id varchar not null,
    transcript jsonb not null,
    summary jsonb not null
);

create index session_summaries_user_created_idx
    on public.session_summaries (user_id, created_at desc);

alter table public.session_summaries enable row level security;

create policy "Users read their own summaries"
    on public.session_summaries for select to authenticated
    using (user_id = (select auth.jwt()->>'sub'));

-- The session must also be the user's own, so nobody can attach a summary to
-- someone else's session.
create policy "Users add summaries to their own sessions"
    on public.session_summaries for insert to authenticated
    with check (
        user_id = (select auth.jwt()->>'sub')
        and exists (
            select 1 from public.session_history s
            where s.id = session_id
              and s.user_id = (select auth.jwt()->>'sub')
        )
    );

commit;
