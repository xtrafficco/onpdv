begin;

do $$
declare
  v_table text;
  v_rls boolean;
  v_force boolean;
begin
  foreach v_table in array array[
    'purchase_workflow_settings',
    'purchase_order_workflow',
    'purchase_receipt_events',
    'purchase_quote_responses',
    'purchase_price_history_v2',
    'purchase_workflow_audit'
  ] loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'Tabela ausente: public.%', v_table;
    end if;

    select c.relrowsecurity, c.relforcerowsecurity
      into v_rls, v_force
    from pg_class c
    where c.oid = to_regclass('public.' || v_table);

    if not v_rls or not v_force then
      raise exception 'RLS incompleta em public.%', v_table;
    end if;
    if has_table_privilege('anon', 'public.' || v_table, 'select')
       or has_table_privilege('authenticated', 'public.' || v_table, 'select') then
      raise exception 'Tabela exposta diretamente: public.%', v_table;
    end if;
  end loop;
end;
$$;

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.erp_purchase_workflow_config()',
    'public.erp_purchase_workflow_config_save(jsonb)',
    'public.erp_purchase_order_metadata_save(text,jsonb)',
    'public.erp_purchase_order_workflow_list(text[])',
    'public.erp_purchase_order_context(text)',
    'public.erp_purchase_receipt_record(text,jsonb,text)',
    'public.erp_purchase_approval_record(text,jsonb,text)',
    'public.erp_purchase_quote_responses_save(jsonb)',
    'public.erp_purchase_quote_responses_list(text[],text)',
    'public.erp_purchase_price_alerts(integer)',
    'public.erp_purchase_workflow_audit_list(integer)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'RPC ausente: %', v_signature;
    end if;
    if has_function_privilege('anon', v_signature, 'execute') then
      raise exception 'RPC liberada para anon: %', v_signature;
    end if;
    if not has_function_privilege('authenticated', v_signature, 'execute') then
      raise exception 'RPC sem grant para authenticated: %', v_signature;
    end if;
  end loop;
end;
$$;

do $$
begin
  if has_function_privilege('authenticated', 'app_private.purchase_actor_allowed(boolean)', 'execute') then
    raise exception 'Helper privado executavel por authenticated';
  end if;
  if not exists (
    select 1 from public.purchase_workflow_settings
    where id = 1 and auto_approval_limit >= 0 and price_increase_alert_percent >= 0
  ) then
    raise exception 'Configuracao singleton do fluxo de compras ausente ou invalida';
  end if;
end;
$$;

rollback;
