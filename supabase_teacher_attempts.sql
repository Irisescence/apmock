-- Allow teachers/admins to share student attempt records across the teacher side.
-- Run this in the Supabase SQL editor.

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

grant execute on function public.current_user_role() to authenticated;

alter table public.attempts enable row level security;
alter table public.profiles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'attempts'
      and policyname = 'Students and teachers can view attempts'
  ) then
    create policy "Students and teachers can view attempts"
    on public.attempts
    for select
    to authenticated
    using (
      user_id = auth.uid()
      or public.current_user_role() in ('teacher', 'admin')
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Teachers can view student profiles'
  ) then
    create policy "Teachers can view student profiles"
    on public.profiles
    for select
    to authenticated
    using (
      id = auth.uid()
      or public.current_user_role() in ('teacher', 'admin')
    );
  end if;
end $$;
