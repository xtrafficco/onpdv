-- ONPDV · Sincronização offline — movimentações de gaveta (sangria/suprimento)
-- Sangria/suprimento feitos offline ficam numa fila local e sincronizam ao reconectar.
-- Idempotência por cash_movements.client_uuid (nova coluna). A movimentação é atribuída
-- à sessão de caixa ABERTA do operador no momento do sync (mesmo modelo das vendas). Se
-- não houver caixa aberto no sync, devolve ok=false/no_session e o cliente mantém na fila.
alter table public.cash_movements add column if not exists client_uuid uuid;
create unique index if not exists cash_movements_client_uuid_uidx
  on public.cash_movements (client_uuid) where client_uuid is not null;

create or replace function public.pdv_sync_offline_movement(
  p_client_id text, p_kind text, p_amount numeric, p_reason text default null,
  p_offline_created_at timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_cid uuid; v_sess uuid; r cash_movements; v_existing uuid;
begin
  begin v_cid := p_client_id::uuid; exception when others then v_cid := md5(p_client_id)::uuid; end;
  -- já sincronizada? (idempotente)
  select id into v_existing from cash_movements where client_uuid=v_cid limit 1;
  if v_existing is not null then
    return jsonb_build_object('ok', true, 'id', v_existing, 'dedup', true);
  end if;
  if p_kind not in ('sangria','suprimento') then raise exception 'Tipo inválido'; end if;
  select id into v_sess from cash_sessions where operador=auth.uid() and status='aberta' limit 1;
  if v_sess is null then
    -- sem caixa aberto agora: não dá para atribuir — cliente mantém na fila e reavisa
    return jsonb_build_object('ok', false, 'reason', 'no_session');
  end if;
  insert into cash_movements (session_id, tipo, valor, motivo, operador, client_uuid)
  values (v_sess, p_kind, abs(coalesce(p_amount,0)), p_reason, auth.uid(), v_cid)
  returning * into r;
  return jsonb_build_object('ok', true, 'id', r.id);
end $function$;

-- Segurança: por padrão o Postgres concede EXECUTE a PUBLIC (inclui anon). Revoga e
-- concede só a authenticated (mesma postura das demais RPCs internas).
revoke execute on function public.pdv_sync_offline_movement(text,text,numeric,text,timestamptz) from public;
revoke execute on function public.pdv_sync_offline_movement(text,text,numeric,text,timestamptz) from anon;
grant execute on function public.pdv_sync_offline_movement(text,text,numeric,text,timestamptz) to authenticated;