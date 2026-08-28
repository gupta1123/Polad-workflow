-- Keep the latest compact Tally company snapshot on the connection so normal
-- company reads do not need to repeat live discovery work.
alter table public.tally_connections
  add column if not exists last_companies_snapshot jsonb not null default '[]'::jsonb;

-- Support the live-master fallback and normal company/master reads efficiently.
create index if not exists
  tally_masters_connection_company_type_active_name_idx
on public.tally_masters (
  connection_id,
  company_name,
  master_type,
  is_active,
  tally_name
);

create index if not exists
  tally_connections_owner_active_updated_idx
on public.tally_connections (owner_user_id, updated_at desc)
where revoked_at is null;
