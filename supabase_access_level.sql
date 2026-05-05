alter table public.exams
  add column if not exists access_level text not null default 'private'
  check (access_level in ('public', 'teacher', 'private'));

update public.exams
set access_level = case when is_public then 'public' else 'private' end
where access_level is null;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'exams'
      and policyname = 'Teachers can view teacher exams'
  ) then
    create policy "Teachers can view teacher exams"
      on public.exams
      for select
      using (
        access_level = 'teacher'
        and exists (
          select 1
          from public.profiles
          where profiles.id = auth.uid()
            and profiles.role in ('teacher', 'admin')
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'questions'
      and policyname = 'Teachers can view teacher exam questions'
  ) then
    create policy "Teachers can view teacher exam questions"
      on public.questions
      for select
      using (
        exists (
          select 1
          from public.exams
          where exams.id = questions.exam_id
            and exams.access_level = 'teacher'
            and exists (
              select 1
              from public.profiles
              where profiles.id = auth.uid()
                and profiles.role in ('teacher', 'admin')
            )
        )
      );
  end if;
end $$;
