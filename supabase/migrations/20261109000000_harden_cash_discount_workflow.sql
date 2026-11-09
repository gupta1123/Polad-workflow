-- Cash Discount workflow hardening (safe subset of Kalika 202608100001).
--
-- What this does:
-- 1. Adds tally_bridge_commands.idempotency_key so the live
--    prepare-debit-note route can queue without double-posting on retry.
-- 2. Enforces one active queued/claimed command per idempotency key.
--
-- Deliberately NOT ported from Kalika:
-- - Duplicate-voucher cleanup UPDATEs (data-affecting; run only after a
--   backup + local verification, never blind).
-- - debit_note_proposals unique indexes on tally_voucher_guid/id
--   (needs the same verification pass first).
-- - RLS policies for cash_discount_rules / debit_note_proposals /
--   collections_analysis_cache (Polaad manages RLS in
--   20260831091749_tally_installation_scope_and_command_leases.sql).

alter table if exists public.tally_bridge_commands
  add column if not exists idempotency_key text;

create unique index if not exists tally_bridge_commands_active_idempotency_idx
  on public.tally_bridge_commands (owner_user_id, command_type, idempotency_key)
  where idempotency_key is not null and status in ('queued', 'claimed');
