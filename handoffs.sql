create table handoffs (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  ticket_id int,
  reason text
);
alter table handoffs enable row level security;
-- Insert only: the public key can log a request but cannot read any.
create policy "log handoff requests" on handoffs for insert with check (true);
