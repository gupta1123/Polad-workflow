-- Per-company Tally settings: the voucher type names the company uses and how
-- strictly the duplicate check treats a hand-typed voucher. Nothing depends on a
-- row existing: the API and the connector fall back to built-in defaults.
create table if not exists public.tally_company_settings (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  -- lower-cased, whitespace-collapsed company name, as the API computes it
  company_key text not null,
  company_name text not null,
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tally_company_settings_key_not_blank check (length(btrim(company_key)) > 0),
  constraint tally_company_settings_is_object check (jsonb_typeof(settings) = 'object'),
  unique (owner_user_id, company_key)
);

alter table public.tally_company_settings enable row level security;

-- Only the API (service role) reads and writes these rows.
revoke all on table public.tally_company_settings from anon, authenticated;
