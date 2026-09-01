-- ONPDV · Sincronização offline — cadastro de cliente
-- O cadastro rápido feito no caixa offline cria um cliente PROVISÓRIO local (com um
-- client_uuid). Ao reconectar, este RPC materializa o cliente de forma idempotente
-- (customers.client_uuid). As vendas offline referenciam o cliente por customer_client_id
-- e pdv_sync_offline_sale resolve para o id real — por isso o cliente sincroniza ANTES.
alter table public.customers add column if not exists client_uuid uuid;
create unique index if not exists customers_client_uuid_uidx
  on public.customers (client_uuid) where client_uuid is not null;

create or replace function public.erp_sync_offline_customer(p_client_id text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_cid uuid; r customers;
begin
  begin v_cid := p_client_id::uuid; exception when others then v_cid := md5(p_client_id)::uuid; end;
  -- idempotente: se já materializado, devolve o existente
  select * into r from customers where client_uuid=v_cid limit 1;
  if r.id is not null then
    return jsonb_build_object('ok', true, 'id', r.id, 'dedup', true);
  end if;
  -- também evita duplicar por documento (CPF) já cadastrado online
  if nullif(p->>'documento','') is not null then
    select * into r from customers where documento = p->>'documento' limit 1;
    if r.id is not null then
      update customers set client_uuid = coalesce(client_uuid, v_cid) where id = r.id;
      return jsonb_build_object('ok', true, 'id', r.id, 'matched_documento', true);
    end if;
  end if;
  insert into customers (nome, codigo, documento, telefone, email, endereco, bairro,
                         nascimento, limite_credito, frete, obs, client_uuid)
  values (p->>'nome', nullif(p->>'codigo',''), p->>'documento',
          regexp_replace(coalesce(p->>'telefone',''),'\D','','g'),
          p->>'email', p->>'endereco', nullif(p->>'bairro',''),
          nullif(p->>'nascimento','')::date,
          coalesce((p->>'limite_credito')::numeric,0), coalesce((p->>'frete')::numeric,0),
          p->>'obs', v_cid)
  returning * into r;
  return jsonb_build_object('ok', true, 'id', r.id);
end $function$;

-- Segurança: revoga o EXECUTE padrão de PUBLIC/anon; concede só a authenticated.
revoke execute on function public.erp_sync_offline_customer(text,jsonb) from public;
revoke execute on function public.erp_sync_offline_customer(text,jsonb) from anon;
grant execute on function public.erp_sync_offline_customer(text,jsonb) to authenticated;