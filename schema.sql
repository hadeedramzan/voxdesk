create table tickets (
  id int primary key,
  subject text not null,
  status text not null check (status in ('open','in_progress','waiting_on_customer','resolved')),
  team text,
  updated_at timestamptz default now()
);
insert into tickets (id, subject, status, team) values
  (1042, 'Duplicate charge on invoice', 'in_progress', 'Billing'),
  (1043, 'Cannot reset password', 'resolved', 'Account Support'),
  (1044, 'Export to CSV fails', 'open', 'Engineering'),
  (1045, 'Change company address', 'waiting_on_customer', 'Account Support'),
  (1046, 'Slow dashboard loading', 'in_progress', 'Engineering');
alter table tickets enable row level security;
-- Read-only for the public key. Nobody can write through the API.
create policy "read only demo" on tickets for select using (true);
