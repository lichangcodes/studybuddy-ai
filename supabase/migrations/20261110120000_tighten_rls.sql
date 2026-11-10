-- Replace the permissive policies with ownership checks.
--
-- Before this migration, anyone holding the public anon key could read every user's
-- session history and bookmarks and delete any bookmark, and any signed-in user could
-- modify or delete rows owned by other users.
--
-- Requests are authenticated with Clerk session tokens (Supabase third-party auth),
-- so the current user's id is auth.jwt()->>'sub'.

begin;

-- companions: public library, but users can only create companions as themselves.
drop policy if exists "All" on public.companions;
drop policy if exists "Clerk" on public.companions;

alter table public.companions alter column author set not null;

create policy "Companions are readable by everyone"
    on public.companions for select to anon, authenticated
    using (true);

create policy "Users create companions as themselves"
    on public.companions for insert to authenticated
    with check (author = (select auth.jwt()->>'sub'));

create index if not exists companions_author_idx on public.companions (author);

-- session_history: private to each user.
drop policy if exists "All" on public.session_history;
drop policy if exists "Clerk" on public.session_history;

alter table public.session_history
    alter column user_id set not null,
    alter column companion_id set not null,
    alter column companion_id drop default;

create policy "Users read their own sessions"
    on public.session_history for select to authenticated
    using (user_id = (select auth.jwt()->>'sub'));

create policy "Users record their own sessions"
    on public.session_history for insert to authenticated
    with check (user_id = (select auth.jwt()->>'sub'));

create index if not exists session_history_user_created_idx
    on public.session_history (user_id, created_at desc);

-- bookmarks: private to each user, at most one per user and companion.
drop policy if exists "All" on public.bookmarks;
drop policy if exists "D" on public.bookmarks;
drop policy if exists "Clerk" on public.bookmarks;

delete from public.bookmarks b
using public.bookmarks earlier
where b.user_id = earlier.user_id
  and b.companion_id = earlier.companion_id
  and (earlier.created_at, earlier.id) < (b.created_at, b.id);

alter table public.bookmarks
    alter column user_id set not null,
    alter column companion_id set not null,
    alter column companion_id drop default,
    add constraint bookmarks_user_companion_key unique (user_id, companion_id);

create policy "Users read their own bookmarks"
    on public.bookmarks for select to authenticated
    using (user_id = (select auth.jwt()->>'sub'));

create policy "Users add their own bookmarks"
    on public.bookmarks for insert to authenticated
    with check (user_id = (select auth.jwt()->>'sub'));

create policy "Users remove their own bookmarks"
    on public.bookmarks for delete to authenticated
    using (user_id = (select auth.jwt()->>'sub'));

-- The home page lists recently used companions across all users, including for
-- signed-out visitors. Session rows are now private, so expose only the session id
-- and companion through a security definer function, never the user id.
create or replace function public.get_recent_sessions(max_rows int default 10)
returns table (session_id uuid, companion public.companions)
language sql
stable
security definer
set search_path = ''
as $$
    select s.id, c
    from public.session_history s
    join public.companions c on c.id = s.companion_id
    order by s.created_at desc
    limit least(greatest(max_rows, 0), 50);
$$;

revoke execute on function public.get_recent_sessions(int) from public;
grant execute on function public.get_recent_sessions(int) to anon, authenticated;

commit;
