-- Step 2 of 2: stop exposing companions.author (a Clerk user id) through the API.
-- Apply only after the app that selects explicit companion columns and uses
-- get_my_companions / count_my_companions is deployed: `select *` on companions
-- fails once a column is not readable.
--
-- RLS decides which rows a role can see; column privileges decide which columns.
-- Inserts are unaffected: the insert policy still checks author against the token,
-- and the app sets author on the server.

begin;

revoke select on public.companions from anon, authenticated;
grant select (id, created_at, name, subject, topic, style, voice, duration)
    on public.companions to anon, authenticated;

commit;
