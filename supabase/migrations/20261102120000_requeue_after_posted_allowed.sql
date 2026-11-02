-- A posted or verified posting-log row no longer blocks queueing the same bank transaction again.
-- Tally is the authority: the connector's live check skips a voucher that is really there and
-- posts one that was deleted. Only a command still queued or claimed blocks a duplicate send.

create or replace function public.enqueue_bank_tally_commands(
  p_owner uuid,
  p_connection uuid,
  p_dataset uuid,
  p_generation bigint,
  p_commands jsonb
)
returns setof public.tally_bridge_commands
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  c public.tally_connections;
  item jsonb;
  q public.tally_bridge_commands;
  tx public.bank_transactions;
  previous public.bank_transaction_posting_log;
begin
  select * into c
  from public.tally_connections
  where id = p_connection
    and owner_user_id = p_owner
    and revoked_at is null
    and session_generation = p_generation
  for update;
  if not found then raise exception 'Connector session changed'; end if;
  if jsonb_array_length(p_commands) > 1000 then raise exception 'Too many commands'; end if;

  for item in select value from jsonb_array_elements(p_commands) loop
    if item->>'command_type' in ('post_bank_voucher', 'verify_bank_transaction') then
      select * into tx
      from public.bank_transactions
      where id = (item#>>'{payload,transactionId}')::uuid
        and owner_user_id = p_owner
        and company_dataset_id = p_dataset
      for update;
      if not found then raise exception 'Transaction outside selected company'; end if;

      select * into previous
      from public.bank_transaction_posting_log
      where owner_user_id = p_owner
        and bank_account_id = tx.bank_account_id
        and fingerprint = tx.fingerprint
      for update;
      -- Only a command still in flight blocks a re-queue. A posted or verified log row
      -- does not: the voucher may have been deleted in Tally, and the connector checks
      -- live Tally before posting (found: skipped, missing: posted).
      if found and previous.status = 'queued' and exists (
        select 1 from public.tally_bridge_commands active
        where active.id = previous.command_id
          and active.status in ('queued','claimed')
      ) then
        raise exception 'Transaction already queued, posted, or awaiting reconciliation';
      end if;
    end if;

    insert into public.tally_bridge_commands(
      connection_id, owner_user_id, company_dataset_id, queue_job_id,
      command_type, status, priority, payload
    ) values (
      c.id, p_owner, p_dataset, nullif(item->>'queue_job_id', '')::uuid,
      item->>'command_type', 'queued', coalesce((item->>'priority')::integer, 100), item->'payload'
    ) returning * into q;

    if q.command_type in ('post_bank_voucher','verify_bank_transaction') then
      insert into public.bank_transaction_posting_log(
        owner_user_id, company_dataset_id, bank_account_id, connection_id,
        source_transaction_id, fingerprint, transaction_date, reference_number,
        description, debit_amount, credit_amount, amount, voucher_type,
        bank_ledger_name, counterparty_ledger_name, command_id, status
      ) values (
        p_owner, p_dataset, tx.bank_account_id, c.id, tx.id, tx.fingerprint,
        tx.transaction_date, tx.reference_number, tx.description, tx.debit_amount,
        tx.credit_amount, (q.payload->>'amount')::numeric, q.payload->>'voucherType',
        q.payload->>'bankLedgerName', q.payload->>'counterpartyLedgerName', q.id, 'queued'
      )
      on conflict(owner_user_id,bank_account_id,fingerprint) do update set
        company_dataset_id=excluded.company_dataset_id,
        connection_id=excluded.connection_id,
        command_id=excluded.command_id,
        status='queued',
        error=null,
        result='{}'::jsonb;

      update public.bank_transactions
      set tally_status=case when q.command_type='post_bank_voucher' then 'pending' else 'checking_in_tally' end,
          confirmed_ledger_name=coalesce(q.payload->>'matchedLedgerName',q.payload->>'counterpartyLedgerName',confirmed_ledger_name),
          ledger_mapping_source='queue_confirmation'
      where id=tx.id;

      update public.bank_accounts
      set tally_connection_id=c.id,
          tally_ledger_name=q.payload->>'bankLedgerName'
      where id=tx.bank_account_id
        and owner_user_id=p_owner
        and company_dataset_id=p_dataset;
    end if;
    return next q;
  end loop;
end
$$;

revoke all on function public.enqueue_bank_tally_commands(uuid,uuid,uuid,bigint,jsonb)
  from public, anon, authenticated;
grant execute on function public.enqueue_bank_tally_commands(uuid,uuid,uuid,bigint,jsonb)
  to service_role;
