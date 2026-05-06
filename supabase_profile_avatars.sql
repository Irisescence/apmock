-- Run this in Supabase SQL editor before using profile avatars.

alter table public.profiles
  add column if not exists avatar_url text;

alter table public.profiles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can insert their own profile'
  ) then
    create policy "Users can insert their own profile"
    on public.profiles
    for insert
    to authenticated
    with check (id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can update their own profile'
  ) then
    create policy "Users can update their own profile"
    on public.profiles
    for update
    to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can view avatars" on storage.objects;
drop policy if exists "Users can upload their own avatars" on storage.objects;
drop policy if exists "Users can update their own avatars" on storage.objects;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public can view avatars'
  ) then
    create policy "Public can view avatars"
    on storage.objects
    for select
    using (bucket_id = 'avatars');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can upload their own avatars'
  ) then
    create policy "Users can upload their own avatars"
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'avatars'
      and owner = auth.uid()
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can update their own avatars'
  ) then
    create policy "Users can update their own avatars"
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'avatars'
      and owner = auth.uid()
    )
    with check (
      bucket_id = 'avatars'
      and owner = auth.uid()
    );
  end if;
end $$;
