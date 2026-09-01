-- ONPDV · Testes do sync offline (vendas, movimentações e clientes)
-- Estilo dos testes do projeto: bloco transacional com asserts via `raise exception`,
-- revertido no final (rollback). Não deixa dados. Rode com o mesmo runner dos demais testes.
begin;

-- 1) Estrutura: funções esperadas existem com a assinatura certa ------------------------
do $$
declare v_sig text;
begin
  foreach v_sig in array array[
    'public.pdv_sync_offline_sale(text, jsonb, timestamp with time zone)',
    'public.pdv_sync_offline_movement(text, text, numeric, text, timestamp with time zone)',
    'public.erp_sync_offline_customer(text, jsonb)'
  ] loop
    if to_regprocedure(v_sig) is null then
      raise exception 'Função ausente ou com assinatura diferente: %', v_sig;
    end if;
    -- authenticated deve poder executar; anon não
    if not has_function_privilege('authenticated', v_sig, 'execute') then
      raise exception 'authenticated sem execute em %', v_sig;
    end if;
    if has_function_privilege('anon', v_sig, 'execute') then
      raise exception 'anon com execute indevido em %', v_sig;
    end if;
  end loop;
end $$;

-- 2) Estrutura: colunas e índices únicos de idempotência --------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='sales' and column_name='client_uuid') then
    raise exception 'sales.client_uuid ausente'; end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='cash_movements' and column_name='client_uuid') then
    raise exception 'cash_movements.client_uuid ausente'; end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='customers' and column_name='client_uuid') then
    raise exception 'customers.client_uuid ausente'; end if;
  if not exists (select 1 from pg_indexes where schemaname='public'
    and indexname='cash_movements_client_uuid_uidx') then
    raise exception 'índice único cash_movements_client_uuid_uidx ausente'; end if;
  if not exists (select 1 from pg_indexes where schemaname='public'
    and indexname='customers_client_uuid_uidx') then
    raise exception 'índice único customers_client_uuid_uidx ausente'; end if;
end $$;

-- 3) Idempotência de venda: reenviar o mesmo client_id NÃO cria outra venda -------------
do $$
declare v_cid uuid := '00000000-0000-0000-0000-0000000000ab';
        v_before int; v_after int; v_res jsonb;
begin
  insert into sales(client_uuid) values (v_cid);   -- simula uma venda já sincronizada
  select count(*) into v_before from sales;
  v_res := pdv_sync_offline_sale(v_cid::text, '{"items":[],"payments":[]}'::jsonb);
  select count(*) into v_after from sales;
  if v_after <> v_before then
    raise exception 'pdv_sync_offline_sale duplicou a venda no reenvio (before=% after=%)', v_before, v_after;
  end if;
  if (v_res->'sale') is null then
    raise exception 'pdv_sync_offline_sale não devolveu a venda existente no dedup';
  end if;
end $$;

-- 4) Idempotência de cliente: reenviar o mesmo client_id devolve o existente ------------
do $$
declare v_cid uuid := '00000000-0000-0000-0000-0000000000cd';
        v_before int; v_after int; v_res jsonb;
begin
  insert into customers(client_uuid, nome) values (v_cid, 'QA Offline');
  select count(*) into v_before from customers;
  v_res := erp_sync_offline_customer(v_cid::text, '{"nome":"QA Offline"}'::jsonb);
  select count(*) into v_after from customers;
  if v_after <> v_before then
    raise exception 'erp_sync_offline_customer duplicou o cliente no reenvio (before=% after=%)', v_before, v_after;
  end if;
  if coalesce((v_res->>'ok')::boolean,false) is not true then
    raise exception 'erp_sync_offline_customer não confirmou ok no dedup';
  end if;
end $$;

rollback;
