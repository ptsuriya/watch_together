create table public.rooms (
  id text primary key check (id ~ '^WAVE-[A-Z0-9]{8}$'),
  host_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.room_members (
  room_id text not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;

create policy "authenticated users can discover invited rooms"
on public.rooms for select to authenticated using (true);

create policy "a host can create a room"
on public.rooms for insert to authenticated with check ((select auth.uid()) = host_id);

create policy "a user can see only their own room membership"
on public.room_members for select to authenticated using ((select auth.uid()) = user_id);

create policy "a user can join an existing room"
on public.room_members for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.rooms where id = room_id)
);

create policy "a user can leave their own room"
on public.room_members for delete to authenticated using ((select auth.uid()) = user_id);

create policy "room members can receive broadcast and presence"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and exists (
    select 1 from public.room_members
    where room_id = substring(realtime.topic() from 6)
      and user_id = (select auth.uid())
  )
);

create policy "room members can send broadcast and presence"
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and exists (
    select 1 from public.room_members
    where room_id = substring(realtime.topic() from 6)
      and user_id = (select auth.uid())
  )
);
