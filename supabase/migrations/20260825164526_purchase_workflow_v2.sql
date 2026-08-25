-- ONPDV - complemento do fluxo de compras.
-- Esta migration e aditiva: nao altera as tabelas nem as RPCs legadas de
-- pedidos de compra. Os novos dados ficam vinculados pelo id textual do pedido,
-- preservando compatibilidade com instalacoes que usam UUID ou bigint.

create schema if not exists app_private;

create table if not exists public.purchase_workflow_settings (
  id smallint primary key default 1,
  auto_approval_limit numeric(14,2) not null default 0,
  price_increase_alert_percent numeric(7,2) not null default 10,
  default_priority text not null default 'normal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint purchase_workflow_settings_singleton check (id = 1),
  constraint purchase_workflow_settings_auto_limit check (auto_approval_limit >= 0),
  constraint purchase_workflow_settings_alert_percent check (
    price_increase_alert_percent >= 0 and price_increase_alert_percent <= 1000
  ),
  constraint purchase_workflow_settings_priority check (
    default_priority in ('baixa', 'normal', 'alta', 'urgente')
  )
);

create table if not exists public.purchase_order_workflow (
  order_id text primary key,
  store_id text,
  supplier_id text,
  requested_by uuid,
  buyer_name text,
  priority text not null default 'normal',
  delivery_on date,
  installments smallint not null default 1,
  approval_type text,
  decision_reason text,
  notes text,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_order_workflow_order_id_not_blank check (btrim(order_id) <> ''),
  constraint purchase_order_workflow_priority check (
    priority in ('baixa', 'normal', 'alta', 'urgente')
  ),
  constraint purchase_order_workflow_installments check (installments between 1 and 120),
  constraint purchase_order_workflow_approval_type check (
    approval_type is null or approval_type in ('manual', 'automatic', 'direct')
  )
);

create table if not exists public.purchase_receipt_events (
  id bigint generated always as identity primary key,
  order_id text not null,
  status text,
  items jsonb not null,
  total numeric(14,2) not null default 0,
  confirmed_by uuid not null,
  confirmed_at timestamptz not null default now(),
  constraint purchase_receipt_events_order_id_not_blank check (btrim(order_id) <> ''),
  constraint purchase_receipt_events_items_array check (jsonb_typeof(items) = 'array'),
  constraint purchase_receipt_events_total check (total >= 0)
);

create table if not exists public.purchase_quote_responses (
  id bigint generated always as identity primary key,
  quote_ref text not null default 'catalog',
  product_id text not null,
  supplier_id text not null,
  unit_price numeric(14,4) not null,
  delivery_days integer not null default 0,
  notes text,
  quoted_by uuid not null,
  quoted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_quote_responses_quote_ref_not_blank check (btrim(quote_ref) <> ''),
  constraint purchase_quote_responses_product_not_blank check (btrim(product_id) <> ''),
  constraint purchase_quote_responses_supplier_not_blank check (btrim(supplier_id) <> ''),
  constraint purchase_quote_responses_price check (unit_price >= 0),
  constraint purchase_quote_responses_delivery_days check (delivery_days between 0 and 3650),
  constraint purchase_quote_responses_unique unique (quote_ref, product_id, supplier_id)
);

create table if not exists public.purchase_price_history_v2 (
  id bigint generated always as identity primary key,
  product_id text not null,
  supplier_id text,
  order_id text,
  receipt_event_id bigint references public.purchase_receipt_events(id) on delete set null,
  unit_price numeric(14,4) not null,
  source text not null default 'receipt',
  recorded_by uuid not null,
  recorded_at timestamptz not null default now(),
  constraint purchase_price_history_v2_product_not_blank check (btrim(product_id) <> ''),
  constraint purchase_price_history_v2_price check (unit_price >= 0),
  constraint purchase_price_history_v2_source check (
    source in ('approval', 'receipt', 'quotation', 'import')
  )
);

create table if not exists public.purchase_workflow_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint purchase_workflow_audit_action_not_blank check (btrim(action) <> ''),
  constraint purchase_workflow_audit_entity_not_blank check (btrim(entity_type) <> ''),
  constraint purchase_workflow_audit_details_object check (jsonb_typeof(details) = 'object')
);

create index if not exists purchase_order_workflow_store_created_idx
  on public.purchase_order_workflow (store_id, created_at desc);
create index if not exists purchase_order_workflow_supplier_created_idx
  on public.purchase_order_workflow (supplier_id, created_at desc);
create index if not exists purchase_order_workflow_approval_created_idx
  on public.purchase_order_workflow (approval_type, created_at desc)
  where approval_type is not null;
create index if not exists purchase_receipt_events_order_confirmed_idx
  on public.purchase_receipt_events (order_id, confirmed_at desc);
create index if not exists purchase_quote_responses_product_price_idx
  on public.purchase_quote_responses (product_id, unit_price, quoted_at desc);
create index if not exists purchase_quote_responses_supplier_idx
  on public.purchase_quote_responses (supplier_id, quoted_at desc);
create index if not exists purchase_price_history_v2_product_recorded_idx
  on public.purchase_price_history_v2 (product_id, recorded_at desc, id desc);
create index if not exists purchase_price_history_v2_order_idx
  on public.purchase_price_history_v2 (order_id, recorded_at desc)
  where order_id is not null;
create unique index if not exists purchase_price_history_v2_approval_once_idx
  on public.purchase_price_history_v2 (order_id, product_id, source)
  where order_id is not null and source = 'approval';
create index if not exists purchase_workflow_audit_entity_idx
  on public.purchase_workflow_audit (entity_type, entity_id, created_at desc);
create index if not exists purchase_workflow_audit_actor_idx
  on public.purchase_workflow_audit (actor_id, created_at desc);

create or replace function app_private.purchase_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists purchase_workflow_settings_touch on public.purchase_workflow_settings;
create trigger purchase_workflow_settings_touch
before update on public.purchase_workflow_settings
for each row execute function app_private.purchase_touch_updated_at();

drop trigger if exists purchase_order_workflow_touch on public.purchase_order_workflow;
create trigger purchase_order_workflow_touch
before update on public.purchase_order_workflow
for each row execute function app_private.purchase_touch_updated_at();

drop trigger if exists purchase_quote_responses_touch on public.purchase_quote_responses;
create trigger purchase_quote_responses_touch
before update on public.purchase_quote_responses
for each row execute function app_private.purchase_touch_updated_at();

create or replace function app_private.purchase_actor_allowed(p_admin_only boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_users u
    where u.id = (select auth.uid())
      and coalesce(u.ativo, true)
      and (
        u.papel = 'admin'
        or (
          not p_admin_only
          and u.papel = 'operador'
          and coalesce(u.permissoes ? 'page_pedidoint', false)
        )
      )
  );
$$;

create or replace function app_private.purchase_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.purchase_workflow_audit (
    actor_id, action, entity_type, entity_id, details
  ) values (
    (select auth.uid()),
    nullif(btrim(p_action), ''),
    nullif(btrim(p_entity_type), ''),
    nullif(btrim(p_entity_id), ''),
    case when jsonb_typeof(coalesce(p_details, '{}'::jsonb)) = 'object'
      then coalesce(p_details, '{}'::jsonb)
      else jsonb_build_object('value', p_details)
    end
  );
end;
$$;

revoke all on function app_private.purchase_touch_updated_at() from public, anon, authenticated;
revoke all on function app_private.purchase_actor_allowed(boolean) from public, anon, authenticated;
revoke all on function app_private.purchase_audit_event(text, text, text, jsonb) from public, anon, authenticated;

insert into public.purchase_workflow_settings (id)
values (1)
on conflict (id) do nothing;

create or replace function public.erp_purchase_workflow_config()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not app_private.purchase_actor_allowed(false) then
    raise exception 'Acesso negado ao fluxo de compras' using errcode = '42501';
  end if;

  select to_jsonb(s) into v_result
  from public.purchase_workflow_settings s
  where s.id = 1;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

create or replace function public.erp_purchase_workflow_config_save(p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auto numeric(14,2);
  v_alert numeric(7,2);
  v_priority text;
  v_result jsonb;
begin
  if not app_private.purchase_actor_allowed(true) then
    raise exception 'Somente o administrador pode alterar o fluxo de compras' using errcode = '42501';
  end if;

  v_auto := greatest(0, coalesce(nullif(p_config ->> 'auto_approval_limit', '')::numeric, 0));
  v_alert := least(1000, greatest(0, coalesce(nullif(p_config ->> 'price_increase_alert_percent', '')::numeric, 10)));
  v_priority := coalesce(nullif(p_config ->> 'default_priority', ''), 'normal');
  if v_priority not in ('baixa', 'normal', 'alta', 'urgente') then
    raise exception 'Prioridade padrao invalida' using errcode = '22023';
  end if;

  insert into public.purchase_workflow_settings (
    id, auto_approval_limit, price_increase_alert_percent, default_priority, updated_by
  ) values (
    1, v_auto, v_alert, v_priority, (select auth.uid())
  )
  on conflict (id) do update set
    auto_approval_limit = excluded.auto_approval_limit,
    price_increase_alert_percent = excluded.price_increase_alert_percent,
    default_priority = excluded.default_priority,
    updated_by = excluded.updated_by
  returning to_jsonb(purchase_workflow_settings.*) into v_result;

  perform app_private.purchase_audit_event(
    'workflow_config_updated', 'purchase_workflow_settings', '1',
    jsonb_build_object('auto_approval_limit', v_auto, 'price_increase_alert_percent', v_alert)
  );
  return v_result;
end;
$$;

create or replace function public.erp_purchase_order_metadata_save(
  p_order text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order text := nullif(btrim(p_order), '');
  v_priority text;
  v_installments smallint;
  v_approval text;
  v_result jsonb;
begin
  if not app_private.purchase_actor_allowed(false) then
    raise exception 'Acesso negado ao fluxo de compras' using errcode = '42501';
  end if;
  if v_order is null then
    raise exception 'Pedido obrigatorio' using errcode = '22023';
  end if;

  v_priority := coalesce(nullif(p_metadata ->> 'priority', ''), 'normal');
  if v_priority not in ('baixa', 'normal', 'alta', 'urgente') then
    raise exception 'Prioridade invalida' using errcode = '22023';
  end if;
  v_installments := greatest(1, least(120, coalesce(nullif(p_metadata ->> 'installments', '')::smallint, 1)));
  v_approval := nullif(p_metadata ->> 'approval_type', '');
  if v_approval is not null and v_approval not in ('manual', 'automatic', 'direct') then
    raise exception 'Tipo de aprovacao invalido' using errcode = '22023';
  end if;

  insert into public.purchase_order_workflow (
    order_id, store_id, supplier_id, requested_by, buyer_name, priority,
    delivery_on, installments, approval_type, decision_reason, notes,
    approved_at, rejected_at
  ) values (
    v_order,
    nullif(p_metadata ->> 'store_id', ''),
    nullif(p_metadata ->> 'supplier_id', ''),
    (select auth.uid()),
    nullif(p_metadata ->> 'buyer_name', ''),
    v_priority,
    nullif(p_metadata ->> 'delivery_on', '')::date,
    v_installments,
    v_approval,
    nullif(p_metadata ->> 'decision_reason', ''),
    nullif(p_metadata ->> 'notes', ''),
    nullif(p_metadata ->> 'approved_at', '')::timestamptz,
    nullif(p_metadata ->> 'rejected_at', '')::timestamptz
  )
  on conflict (order_id) do update set
    store_id = coalesce(excluded.store_id, purchase_order_workflow.store_id),
    supplier_id = coalesce(excluded.supplier_id, purchase_order_workflow.supplier_id),
    buyer_name = coalesce(excluded.buyer_name, purchase_order_workflow.buyer_name),
    priority = case when p_metadata ? 'priority' then excluded.priority else purchase_order_workflow.priority end,
    delivery_on = case when p_metadata ? 'delivery_on' then excluded.delivery_on else purchase_order_workflow.delivery_on end,
    installments = case when p_metadata ? 'installments' then excluded.installments else purchase_order_workflow.installments end,
    approval_type = coalesce(excluded.approval_type, purchase_order_workflow.approval_type),
    decision_reason = case when p_metadata ? 'decision_reason' then excluded.decision_reason else purchase_order_workflow.decision_reason end,
    notes = case when p_metadata ? 'notes' then excluded.notes else purchase_order_workflow.notes end,
    approved_at = coalesce(excluded.approved_at, purchase_order_workflow.approved_at),
    rejected_at = coalesce(excluded.rejected_at, purchase_order_workflow.rejected_at)
  returning to_jsonb(purchase_order_workflow.*) into v_result;

  perform app_private.purchase_audit_event(
    'order_metadata_saved', 'purchase_order', v_order,
    jsonb_build_object('approval_type', v_approval, 'priority', v_priority)
  );
  return v_result;
end;
$$;

create or replace function public.erp_purchase_order_workflow_list(p_orders text[] default null)
returns table (
  order_id text,
  buyer_name text,
  priority text,
  delivery_on date,
  installments smallint,
  approval_type text,
  decision_reason text,
  approved_at timestamptz,
  rejected_at timestamptz,
  receipt_count bigint,
  received_total numeric
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
  select
    w.order_id, w.buyer_name, w.priority, w.delivery_on, w.installments,
    w.approval_type, w.decision_reason, w.approved_at, w.rejected_at,
    count(r.id)::bigint,
    coalesce(sum(r.total), 0)::numeric
  from public.purchase_order_workflow w
  left join public.purchase_receipt_events r on r.order_id = w.order_id
  where p_orders is null or w.order_id = any(p_orders)
  group by w.order_id, w.buyer_name, w.priority, w.delivery_on, w.installments,
    w.approval_type, w.decision_reason, w.approved_at, w.rejected_at
  order by w.order_id;
end;
$$;

create or replace function public.erp_purchase_order_context(p_order text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order text := nullif(btrim(p_order), '');
  v_result jsonb;
begin
  if not app_private.purchase_actor_allowed(false) then
    raise exception 'Acesso negado ao fluxo de compras' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'metadata', coalesce((select to_jsonb(w) from public.purchase_order_workflow w where w.order_id = v_order), '{}'::jsonb),
    'receipts', coalesce((select jsonb_agg(to_jsonb(r) order by r.confirmed_at desc) from public.purchase_receipt_events r where r.order_id = v_order), '[]'::jsonb),
    'prices', coalesce((select jsonb_agg(to_jsonb(h) order by h.recorded_at desc, h.id desc) from public.purchase_price_history_v2 h where h.order_id = v_order), '[]'::jsonb)
  ) into v_result;
  return coalesce(v_result, jsonb_build_object('metadata', '{}'::jsonb, 'receipts', '[]'::jsonb, 'prices', '[]'::jsonb));
end;
$$;

create or replace function public.erp_purchase_receipt_record(
  p_order text,
  p_items jsonb,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order text := nullif(btrim(p_order), '');
  v_item jsonb;
  v_product text;
  v_supplier text;
  v_qty numeric;
  v_price numeric(14,4);
  v_total numeric(14,2) := 0;
  v_receipt_id bigint;
  v_cost_column text;
begin
  if not app_private.purchase_actor_allowed(false) then
    raise exception 'Acesso negado ao fluxo de compras' using errcode = '42501';
  end if;
  if v_order is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Pedido e itens recebidos sao obrigatorios' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product := nullif(v_item ->> 'product_id', '');
    v_qty := coalesce(nullif(v_item ->> 'qtd_recebida', '')::numeric, 0);
    v_price := greatest(0, coalesce(nullif(v_item ->> 'unit_price', '')::numeric, 0));
    if v_product is null or v_qty <= 0 then
      raise exception 'Produto e quantidade recebida validos sao obrigatorios' using errcode = '22023';
    end if;
    v_total := v_total + round(v_qty * v_price, 2);
  end loop;

  insert into public.purchase_receipt_events (
    order_id, status, items, total, confirmed_by
  ) values (
    v_order, nullif(btrim(p_status), ''), p_items, v_total, (select auth.uid())
  ) returning id into v_receipt_id;

  select w.supplier_id into v_supplier
  from public.purchase_order_workflow w
  where w.order_id = v_order;

  if to_regclass('public.products') is not null then
    select a.attname into v_cost_column
    from pg_attribute a
    where a.attrelid = 'public.products'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and a.attname in ('custo', 'cost')
    order by case a.attname when 'custo' then 1 else 2 end
    limit 1;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product := v_item ->> 'product_id';
    v_price := greatest(0, coalesce(nullif(v_item ->> 'unit_price', '')::numeric, 0));

    insert into public.purchase_price_history_v2 (
      product_id, supplier_id, order_id, receipt_event_id, unit_price, source, recorded_by
    ) values (
      v_product, v_supplier, v_order, v_receipt_id, v_price, 'receipt', (select auth.uid())
    );

    if v_cost_column is not null then
      execute format('update public.products set %I = $1 where id::text = $2', v_cost_column)
        using v_price, v_product;
    end if;
  end loop;

  perform app_private.purchase_audit_event(
    'receipt_recorded', 'purchase_order', v_order,
    jsonb_build_object('receipt_event_id', v_receipt_id, 'total', v_total, 'status', p_status)
  );
  return jsonb_build_object('id', v_receipt_id, 'total', v_total, 'status', p_status);
end;
$$;

create or replace function public.erp_purchase_approval_record(
  p_order text,
  p_items jsonb,
  p_approval_type text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order text := nullif(btrim(p_order), '');
  v_item jsonb;
  v_product text;
  v_supplier text;
  v_price numeric(14,4);
  v_count integer := 0;
begin
  if not app_private.purchase_actor_allowed(false) then
    raise exception 'Acesso negado ao fluxo de compras' using errcode = '42501';
  end if;
  if v_order is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Pedido e itens aprovados sao obrigatorios' using errcode = '22023';
  end if;
  if p_approval_type not in ('manual', 'automatic', 'direct') then
    raise exception 'Tipo de aprovacao invalido' using errcode = '22023';
  end if;

  select w.supplier_id into v_supplier
  from public.purchase_order_workflow w
  where w.order_id = v_order;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product := nullif(v_item ->> 'product_id', '');
    v_price := greatest(0, coalesce(
      nullif(v_item ->> 'unit_price', '')::numeric,
      nullif(v_item ->> 'custo', '')::numeric,
      nullif(v_item ->> 'custo_unit', '')::numeric,
      0
    ));
    if v_product is null then
      raise exception 'Produto obrigatorio no registro da aprovacao' using errcode = '22023';
    end if;

    insert into public.purchase_price_history_v2 (
      product_id, supplier_id, order_id, unit_price, source, recorded_by
    ) values (
      v_product, v_supplier, v_order, v_price, 'approval', (select auth.uid())
    ) on conflict (order_id, product_id, source)
      where order_id is not null and source = 'approval'
      do update set
        unit_price = excluded.unit_price,
        supplier_id = excluded.supplier_id,
        recorded_by = excluded.recorded_by,
        recorded_at = now();
    v_count := v_count + 1;
  end loop;

  perform app_private.purchase_audit_event(
    'order_approved', 'purchase_order', v_order,
    jsonb_build_object('approval_type', p_approval_type, 'item_count', v_count)
  );
  return jsonb_build_object('count', v_count, 'approval_type', p_approval_type);
end;
$$;

create or replace function public.erp_purchase_quote_responses_save(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_quote text;
  v_product text;
  v_supplier text;
  v_price numeric(14,4);
  v_days integer;
  v_count integer := 0;
begin
  if not app_private.purchase_actor_allowed(false) then
    raise exception 'Acesso negado ao fluxo de compras' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Lista de cotacoes invalida' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quote := coalesce(nullif(v_item ->> 'quote_ref', ''), 'catalog');
    v_product := nullif(v_item ->> 'product_id', '');
    v_supplier := nullif(v_item ->> 'supplier_id', '');
    v_price := greatest(0, coalesce(nullif(v_item ->> 'unit_price', '')::numeric, 0));
    v_days := greatest(0, least(3650, coalesce(nullif(v_item ->> 'delivery_days', '')::integer, 0)));
    if v_product is null or v_supplier is null or v_price <= 0 then
      raise exception 'Produto, fornecedor e preco sao obrigatorios na cotacao' using errcode = '22023';
    end if;

    insert into public.purchase_quote_responses (
      quote_ref, product_id, supplier_id, unit_price, delivery_days, notes, quoted_by
    ) values (
      v_quote, v_product, v_supplier, v_price, v_days,
      nullif(v_item ->> 'notes', ''), (select auth.uid())
    )
    on conflict (quote_ref, product_id, supplier_id) do update set
      unit_price = excluded.unit_price,
      delivery_days = excluded.delivery_days,
      notes = excluded.notes,
      quoted_by = excluded.quoted_by,
      quoted_at = now();

    insert into public.purchase_price_history_v2 (
      product_id, supplier_id, unit_price, source, recorded_by
    ) values (
      v_product, v_supplier, v_price, 'quotation', (select auth.uid())
    );
    v_count := v_count + 1;
  end loop;

  perform app_private.purchase_audit_event(
    'quote_responses_saved', 'purchase_quote', null,
    jsonb_build_object('count', v_count)
  );
  return jsonb_build_object('count', v_count);
end;
$$;

create or replace function public.erp_purchase_quote_responses_list(
  p_products text[] default null,
  p_quote_ref text default null
)
returns table (
  quote_ref text,
  product_id text,
  supplier_id text,
  unit_price numeric,
  delivery_days integer,
  notes text,
  quoted_at timestamptz,
  is_best boolean
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
  select
    q.quote_ref, q.product_id, q.supplier_id, q.unit_price, q.delivery_days,
    q.notes, q.quoted_at,
    q.unit_price = min(q.unit_price) over (partition by q.product_id) as is_best
  from public.purchase_quote_responses q
  where (p_products is null or q.product_id = any(p_products))
    and (p_quote_ref is null or q.quote_ref = p_quote_ref)
  order by q.product_id, q.unit_price, q.quoted_at desc;
end;
$$;

create or replace function public.erp_purchase_price_alerts(p_limit integer default 50)
returns table (
  product_id text,
  current_price numeric,
  previous_price numeric,
  increase_percent numeric,
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
  with ranked as (
    select
      h.product_id,
      h.unit_price,
      h.recorded_at,
      row_number() over (partition by h.product_id order by h.recorded_at desc, h.id desc) as rn
    from public.purchase_price_history_v2 h
    where h.source in ('approval', 'receipt')
  ), compared as (
    select
      r.product_id,
      max(r.unit_price) filter (where r.rn = 1) as current_price,
      max(r.unit_price) filter (where r.rn = 2) as previous_price,
      max(r.recorded_at) filter (where r.rn = 1) as recorded_at
    from ranked r
    where r.rn <= 2
    group by r.product_id
  )
  select
    c.product_id,
    c.current_price,
    c.previous_price,
    round(((c.current_price - c.previous_price) / nullif(c.previous_price, 0)) * 100, 2),
    c.recorded_at
  from compared c
  cross join public.purchase_workflow_settings s
  where s.id = 1
    and c.previous_price > 0
    and c.current_price > c.previous_price
    and ((c.current_price - c.previous_price) / c.previous_price) * 100 >= s.price_increase_alert_percent
  order by 4 desc, c.recorded_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 500));
end;
$$;

create or replace function public.erp_purchase_workflow_audit_list(p_limit integer default 100)
returns table (
  id bigint,
  actor_id uuid,
  action text,
  entity_type text,
  entity_id text,
  details jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.purchase_actor_allowed(true) then
    raise exception 'Somente o administrador pode consultar esta auditoria' using errcode = '42501';
  end if;

  return query
  select a.id, a.actor_id, a.action, a.entity_type, a.entity_id, a.details, a.created_at
  from public.purchase_workflow_audit a
  order by a.created_at desc, a.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 1000));
end;
$$;

alter table public.purchase_workflow_settings enable row level security;
alter table public.purchase_workflow_settings force row level security;
alter table public.purchase_order_workflow enable row level security;
alter table public.purchase_order_workflow force row level security;
alter table public.purchase_receipt_events enable row level security;
alter table public.purchase_receipt_events force row level security;
alter table public.purchase_quote_responses enable row level security;
alter table public.purchase_quote_responses force row level security;
alter table public.purchase_price_history_v2 enable row level security;
alter table public.purchase_price_history_v2 force row level security;
alter table public.purchase_workflow_audit enable row level security;
alter table public.purchase_workflow_audit force row level security;

revoke all on table public.purchase_workflow_settings from public, anon, authenticated;
revoke all on table public.purchase_order_workflow from public, anon, authenticated;
revoke all on table public.purchase_receipt_events from public, anon, authenticated;
revoke all on table public.purchase_quote_responses from public, anon, authenticated;
revoke all on table public.purchase_price_history_v2 from public, anon, authenticated;
revoke all on table public.purchase_workflow_audit from public, anon, authenticated;

revoke all on function public.erp_purchase_workflow_config() from public, anon;
revoke all on function public.erp_purchase_workflow_config_save(jsonb) from public, anon;
revoke all on function public.erp_purchase_order_metadata_save(text, jsonb) from public, anon;
revoke all on function public.erp_purchase_order_workflow_list(text[]) from public, anon;
revoke all on function public.erp_purchase_order_context(text) from public, anon;
revoke all on function public.erp_purchase_receipt_record(text, jsonb, text) from public, anon;
revoke all on function public.erp_purchase_approval_record(text, jsonb, text) from public, anon;
revoke all on function public.erp_purchase_quote_responses_save(jsonb) from public, anon;
revoke all on function public.erp_purchase_quote_responses_list(text[], text) from public, anon;
revoke all on function public.erp_purchase_price_alerts(integer) from public, anon;
revoke all on function public.erp_purchase_workflow_audit_list(integer) from public, anon;

grant execute on function public.erp_purchase_workflow_config() to authenticated;
grant execute on function public.erp_purchase_workflow_config_save(jsonb) to authenticated;
grant execute on function public.erp_purchase_order_metadata_save(text, jsonb) to authenticated;
grant execute on function public.erp_purchase_order_workflow_list(text[]) to authenticated;
grant execute on function public.erp_purchase_order_context(text) to authenticated;
grant execute on function public.erp_purchase_receipt_record(text, jsonb, text) to authenticated;
grant execute on function public.erp_purchase_approval_record(text, jsonb, text) to authenticated;
grant execute on function public.erp_purchase_quote_responses_save(jsonb) to authenticated;
grant execute on function public.erp_purchase_quote_responses_list(text[], text) to authenticated;
grant execute on function public.erp_purchase_price_alerts(integer) to authenticated;
grant execute on function public.erp_purchase_workflow_audit_list(integer) to authenticated;
