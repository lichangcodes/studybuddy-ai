-- Baseline: the schema as originally created in the Supabase dashboard.
-- The access policies here are permissive; 20261110120000_tighten_rls.sql replaces them.

create table public.companions (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    name varchar,
    subject varchar,
    topic varchar,
    style varchar,
    voice varchar,
    duration bigint,
    author varchar
);

create table public.session_history (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    user_id varchar,
    companion_id uuid default gen_random_uuid()
        references public.companions (id) on update cascade on delete cascade
);

create table public.bookmarks (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    user_id varchar,
    companion_id uuid default gen_random_uuid()
        references public.companions (id) on update cascade on delete cascade
);

alter table public.companions enable row level security;
alter table public.session_history enable row level security;
alter table public.bookmarks enable row level security;

create policy "All" on public.companions for select to anon using (true);
create policy "Clerk" on public.companions for all to authenticated
    using ((select auth.jwt()) is not null) with check ((select auth.jwt()) is not null);

create policy "All" on public.session_history for select to anon using (true);
create policy "Clerk" on public.session_history for all to authenticated
    using ((select auth.jwt()) is not null) with check ((select auth.jwt()) is not null);

create policy "All" on public.bookmarks for select to anon using (true);
create policy "D" on public.bookmarks for delete to anon using (true);
create policy "Clerk" on public.bookmarks for all to authenticated
    using ((select auth.jwt()) is not null) with check ((select auth.jwt()) is not null);
