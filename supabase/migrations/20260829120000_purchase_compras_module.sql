-- ONPDV - modulo Compras (fusao COMPRAS247).
-- Migration aditiva: nao altera tabelas nem RPCs existentes. Adiciona apenas:
--   1. purchase_order_drafts  -> fila de pedidos manuais aguardando aprovacao
--      (o pedido vira um pedido de compra real via erp_po_create somente na aprovacao,
--       preservando a semantica "a conta a pagar so nasce quando o admin aprova").
--   2. erp_purchase_price_history_product -> historico de preco de compra por produto,
--      lido da purchase_price_history_v2 ja criada na migration do fluxo de compras.
-- Reaproveita app_private.purchase_actor_allowed / purchase_audit_event da migration v2.

create table if not exists public.purchase_order_drafts (
  id bigint generated always as identity primary key,
  store_id text,
  supplier_id text,
  buyer_name text,
  priority text not null default 'normal',
  delivery_on date,
  installments smallint not null default 1,
  interval_days smallint not null default 30,
  notes text,
  items jsonb not null default '[]'::jsonb,
  total numeric(14,2) not null default 0,
  status text not null default 'pending',
  decision_reason text,
  order_id text,
  requested_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_order_drafts_priority check (priority in ('baixa','normal','alta','urgente')),
  constraint purchase_order_drafts_installments check (installments between 1 and 120),
  constraint purchase_order_drafts_interval check (interval_days between 1 and 365),
  constraint purchase_order_drafts_items_array check (jsonb_typeof(items) = 'array'),
  constraint purchase_order_drafts_total check (total >= 0),
  constraint purchase_order_drafts_status check (status in ('pending','approved','rejected'))
);

create index if not exists purchase_order_drafts_status_created_idx
  on public.purchase_order_drafts (status, created_at desc);

drop trigger if exists purchase_order_drafts_touch on public.purchase_order_drafts;
create trigger purchase_order_drafts_touch
before update on public.purchase_order_drafts
for each row execute function app_private.purchase_touch_updated_at();

create or replace function public.erp_purchase_draft_save(p_draft jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint := nullif(p_draft ->> 'id', '')::bigint;
  v_priority text;
  v_installments smallint;
  v_interval smallint;
  v_items jsonb;
  v_total numeric(14,2) := 0;
  v_item jsonb;
  v_result jsonb;
begin
  if not app_private.purchase_actor_allowed(false) then
    raise exception 'Acesso negado ao fluxo de compras' using errcode = '42501';
  end if;

  v_items := coalesce(p_draft -> 'items', '[]'::jsonb);
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'Informe ao menos um item no pedido' using errcode = '22023';
  end if;

  v_priority := coalesce(nullif(p_draft ->> 'priority', ''), 'normal');
  if v_priority not in ('baixa','normal','alta','urgente') then
    v_priority := 'normal';
  end if;
  v_installments := greatest(1, least(120, coalesce(nullif(p_draft ->> 'installments', '')::smallint, 1)));
  v_interval := greatest(1, least(365, coalesce(nullif(p_draft ->> 'interval_days', '')::smallint, 30)));

  for v_item in select value from jsonb_array_elements(v_items)
  loop
    v_total := v_total + round(
      coalesce(nullif(v_item ->> 'qtd', '')::numeric, 0) *
      greatest(0, coalesce(nullif(v_item ->> 'custo', '')::numeric, 0)), 2);
  end loop;

  if v_id is null then
    insert into public.purchase_order_drafts (
      store_id, supplier_id, buyer_name, priority, delivery_on, installments,
      interval_days, notes, items, total, status, requested_by
    ) values (
      nullif(p_draft ->> 'store_id', ''), nullif(p_draft ->> 'supplier_id', ''),
      nullif(p_draft ->> 'buyer_name', ''), v_priority,
      nullif(p_draft ->> 'delivery_on', '')::date, v_installments, v_interval,
      nullif(p_draft ->> 'notes', ''), v_items, v_total, 'pending', (select auth.uid())
    ) returning to_jsonb(purchase_order_drafts.*) into v_result;
  else
    update public.purchase_order_drafts set
      store_id = nullif(p_draft ->> 'store_id', ''),
      supplier_id = nullif(p_draft ->> 'supplier_id', ''),
      buyer_name = nullif(p_draft ->> 'buyer_name', ''),
      priority = v_priority,
      delivery_on = nullif(p_draft ->> 'delivery_on', '')::date,
      installments = v_installments,
      interval_days = v_interval,
      notes = nullif(p_draft ->> 'notes', ''),
      items = v_items,
      total = v_total
    where id = v_id and status = 'pending'
    returning to_jsonb(purchase_order_drafts.*) into v_result;
    if v_result is null then
      raise exception 'Rascunho de pedido nao encontrado ou ja decidido' using errcode = 'P0002';
    end if;
  end if;

  perform app_private.purchase_audit_event(
    'purchase_draft_saved', 'purchase_draft', (v_result ->> 'id'),
    jsonb_build_object('total', v_total, 'supplier_id', v_result ->> 'supplier_id')
  );
  return v_result;
end;
$$;

create or replace function public.erp_purchase_draft_list(p_status text default 'pending')
returns setof public.purchase_order_drafts
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.purchase_actor_allowed(false) then
    raise exception 'Acesso negado ao fluxo de compras' using errcode = '42501';
  end if;
  return query
  select *
  from public.purchase_order_drafts d
  where p_status is null or d.status = p_status
  order by d.created_at desc, d.id desc;
end;
$$;

create or replace function public.erp_purchase_draft_set_status(
  p_id bigint,
  p_status text,
  p_reason text default null,
  p_order_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not app_private.purchase_actor_allowed(true) then
    raise exception 'Somente o administrador pode decidir pedidos de compra' using errcode = '42501';
  end if;
  if p_status not in ('approved','rejected') then
    raise exception 'Status invalido' using errcode = '22023';
  end if;

  update public.purchase_order_drafts set
    status = p_status,
    decision_reason = nullif(btrim(coalesce(p_reason, '')), ''),
    order_id = coalesce(nullif(btrim(coalesce(p_order_id, '')), ''), order_id)
  where id = p_id and status = 'pending'
  returning to_jsonb(purchase_order_drafts.*) into v_result;

  if v_result is null then
    raise exception 'Pedido nao encontrado ou ja decidido' using errcode = 'P0002';
  end if;

  perform app_private.purchase_audit_event(
    case when p_status = 'approved' then 'purchase_draft_approved' else 'purchase_draft_rejected' end,
    'purchase_draft', p_id::text,
    jsonb_build_object('order_id', p_order_id, 'reason', p_reason)
  );
  return v_result;
end;
$$;

create or replace function public.erp_purchase_draft_delete(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if not app_private.purchase_actor_allowed(false) then
    raise exception 'Acesso negado ao fluxo de compras' using errcode = '42501';
  end if;
  select requested_by into v_owner from public.purchase_order_drafts where id = p_id and status = 'pending';
  if v_owner is null then
    raise exception 'Rascunho nao encontrado ou ja decidido' using errcode = 'P0002';
  end if;
  if not app_private.purchase_actor_allowed(true) and v_owner is distinct from (select auth.uid()) then
    raise exception 'Somente o autor ou o administrador podem excluir este rascunho' using errcode = '42501';
  end if;
  delete from public.purchase_order_drafts where id = p_id;
  perform app_private.purchase_audit_event('purchase_draft_deleted', 'purchase_draft', p_id::text, '{}'::jsonb);
  return jsonb_build_object('id', p_id, 'deleted', true);
end;
$$;

create or replace function public.erp_purchase_price_history_product(
  p_product text,
  p_limit integer default 60
)
returns table (
  id bigint,
  supplier_id text,
  order_id text,
  unit_price numeric,
  source text,
  recorded_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.purchase_actor_allowed(false) then
    raise exception 'Acesso negado ao fluxo de compras' using errcode = '42501';
  end if;
  return query
  select h.id, h.supplier_id, h.order_id, h.unit_price, h.source, h.recorded_at
  from public.purchase_price_history_v2 h
  where h.product_id = nullif(btrim(p_product), '')
  order by h.recorded_at desc, h.id desc
  limit greatest(1, least(coalesce(p_limit, 60), 500));
end;
$$;

alter table public.purchase_order_drafts enable row level security;
alter table public.purchase_order_drafts force row level security;
revoke all on table public.purchase_order_drafts from public, anon, authenticated;

revoke all on function public.erp_purchase_draft_save(jsonb) from public, anon;
revoke all on function public.erp_purchase_draft_list(text) from public, anon;
revoke all on function public.erp_purchase_draft_set_status(bigint, text, text, text) from public, anon;
revoke all on function public.erp_purchase_draft_delete(bigint) from public, anon;
revoke all on function public.erp_purchase_price_history_product(text, integer) from public, anon;

grant execute on function public.erp_purchase_draft_save(jsonb) to authenticated;
grant execute on function public.erp_purchase_draft_list(text) to authenticated;
grant execute on function public.erp_purchase_draft_set_status(bigint, text, text, text) to authenticated;
grant execute on function public.erp_purchase_draft_delete(bigint) to authenticated;
grant execute on function public.erp_purchase_price_history_product(text, integer) to authenticated;
