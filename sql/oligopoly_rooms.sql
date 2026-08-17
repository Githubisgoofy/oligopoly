-- Schema for storing game rooms for Oligopoly
create table public.oligopoly_rooms (
  code text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

-- keep updated_at fresh automatically
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger oligopoly_rooms_touch
before update on public.oligopoly_rooms
for each row execute function public.touch_updated_at();

-- allow the publishable/anon key to read and write rooms
-- (fine for a casual game with no auth; lock down further if you ever need to)
alter table public.oligopoly_rooms enable row level security;

create policy "anyone can read rooms"
on public.oligopoly_rooms for select
using (true);

create policy "anyone can insert rooms"
on public.oligopoly_rooms for insert
with check (true);

create policy "anyone can update rooms"
on public.oligopoly_rooms for update
using (true);
