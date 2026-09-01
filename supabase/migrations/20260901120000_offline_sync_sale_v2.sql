-- ONPDV · Sincronização offline — vendas (v2)
-- Melhora pdv_sync_offline_sale mantendo a idempotência por sales.client_uuid e o
-- comportamento existente, e adicionando duas capacidades para o modo offline do caixa:
--   1) Propaga a LOJA da venda (payload.store_id) — relevante para admin multi-loja,
--      pois erp_checkout_multi só honra p_store para admin/sem-auth; operador segue
--      travado em my_store() como antes.
--   2) Resolve o CLIENTE cadastrado offline: se a venda não tem customer_id mas traz
--      customer_client_id (uuid do cadastro provisório), busca o cliente já sincronizado
--      por customers.client_uuid. Se ainda não existir, a venda entra como anônima.
-- session_id continua irrelevante: erp_checkout_multi deriva a sessão aberta do operador.
create or replace function public.pdv_sync_offline_sale(
  p_device_sale_id text, p_payload jsonb, p_offline_created_at timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_existing uuid; v_num bigint; v_res jsonb; v_cid uuid; v_customer uuid;
begin
  begin v_cid := p_device_sale_id::uuid; exception when others then
    v_cid := md5(p_device_sale_id)::uuid; end;
  select id, numero into v_existing, v_num from sales where client_uuid=v_cid limit 1;
  if v_existing is not null then
    return jsonb_build_object('sale', jsonb_build_object('id',v_existing,'order_id',v_existing,'num',v_num,
      'total',(select total from sales where id=v_existing),'change',0,
      'subtotal',(select subtotal from sales where id=v_existing),'discount',0,
      'member_disc',0,'cashback_used',0,'surcharge',0,'cashback_earned',0,'cashback_balance',0));
  end if;
  -- cliente: id direto OU cliente criado offline (resolvido por client_uuid)
  v_customer := coalesce(
    nullif(p_payload->>'customer_id','')::uuid,
    (select id from customers where client_uuid = nullif(p_payload->>'customer_client_id','')::uuid));
  v_res := pdv_checkout(
    nullif(p_payload->>'session_id','')::uuid,
    v_customer,
    coalesce(p_payload->'items','[]'::jsonb),
    coalesce((p_payload->>'discount')::numeric,0),
    coalesce((p_payload->>'surcharge')::numeric,0),
    coalesce((p_payload->>'cashback')::numeric,0),
    coalesce(p_payload->'payments','[]'::jsonb),
    p_payload->>'note',
    nullif(p_payload->>'store_id','')::uuid);
  update sales set client_uuid=v_cid where id=(v_res->>'id')::uuid and client_uuid is null;
  return jsonb_build_object('sale', v_res);
end $function$;