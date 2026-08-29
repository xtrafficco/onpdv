-- Histórico de mais vendidos (curva ABC histórica)
-- Permite importar, mês a mês, o ranking de produtos por quantidade e faturamento
-- vindo de sistemas antigos, sem tocar em sales/sale_items (não afeta caixa/DRE).

create table if not exists public.product_sales_history (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  nome         text not null,
  ref_month    date not null,                         -- sempre o dia 1 do mês de competência
  qtd          numeric not null default 0,
  faturamento  numeric not null default 0,
  custo        numeric not null default 0,
  origem       text not null default 'import',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- chave de deduplicação: por produto quando casado, senão pelo nome normalizado
  match_key    text generated always as (coalesce(product_id::text, lower(btrim(nome)))) stored,
  constraint uq_psh_store_month_key unique (store_id, ref_month, match_key)
);

create index if not exists ix_psh_store_month on public.product_sales_history (store_id, ref_month);
create index if not exists ix_psh_product on public.product_sales_history (product_id);

alter table public.product_sales_history enable row level security;

drop policy if exists psh_select on public.product_sales_history;
create policy psh_select on public.product_sales_history for select
  using (public.is_admin() or store_id = public.my_store());

drop policy if exists psh_all on public.product_sales_history;
create policy psh_all on public.product_sales_history for all
  using (public.is_admin() or store_id = public.my_store())
  with check (public.is_admin() or store_id = public.my_store());

-- Importação em lote de um mês. Casa produto por SKU, depois código de barras, depois nome.
create or replace function public.erp_sales_history_import(
  p_rows jsonb,
  p_month date,
  p_store uuid default null
) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare
  v_my      uuid := my_store();
  v_admin   boolean := coalesce(is_admin(), false);
  v_store   uuid := coalesce(p_store, v_my);
  v_month   date := date_trunc('month', p_month)::date;
  v_ok      int := 0;
  v_matched int := 0;
  r      jsonb;
  v_pid  uuid;
  v_nome text;
  v_sku  text;
  v_bar  text;
  v_qtd  numeric;
  v_fat  numeric;
  v_custo numeric;
begin
  if v_store is null then raise exception 'Loja não identificada'; end if;
  -- null-safe: sem sessão (v_my null) e sem admin, nega
  if not (v_admin or (v_my is not null and v_store = v_my)) then
    raise exception 'Sem permissão para esta loja';
  end if;

  for r in select value from jsonb_array_elements(p_rows) as t(value) loop
    v_nome  := btrim(coalesce(r->>'nome',''));
    v_sku   := nullif(btrim(coalesce(r->>'sku','')),'');
    v_bar   := nullif(btrim(coalesce(r->>'codigo_barras','')),'');
    v_qtd   := coalesce(nullif(r->>'qtd','')::numeric, 0);
    v_fat   := coalesce(nullif(r->>'faturamento','')::numeric, 0);
    v_custo := coalesce(nullif(r->>'custo','')::numeric, 0);
    if v_nome = '' and v_sku is null and v_bar is null then continue; end if;

    v_pid := null;
    if v_sku is not null then
      select id into v_pid from products where sku = v_sku limit 1;
    end if;
    if v_pid is null and v_bar is not null then
      select id into v_pid from products where codigo_barras = v_bar limit 1;
    end if;
    if v_pid is null and v_nome <> '' then
      select id into v_pid from products where lower(btrim(nome)) = lower(v_nome) limit 1;
    end if;
    if v_pid is not null then
      v_matched := v_matched + 1;
      if v_nome = '' then select nome into v_nome from products where id = v_pid; end if;
    end if;

    insert into product_sales_history(store_id, product_id, nome, ref_month, qtd, faturamento, custo)
    values (v_store, v_pid, coalesce(nullif(v_nome,''),'(sem nome)'), v_month, v_qtd, v_fat, v_custo)
    on conflict (store_id, ref_month, match_key)
    do update set qtd = excluded.qtd,
                  faturamento = excluded.faturamento,
                  custo = excluded.custo,
                  product_id = coalesce(excluded.product_id, product_sales_history.product_id),
                  updated_at = now();
    v_ok := v_ok + 1;
  end loop;

  return jsonb_build_object('ok', v_ok, 'matched', v_matched, 'month', v_month);
end $$;

-- Curva ABC calculada sobre o histórico importado, por métrica (faturamento ou qtd).
create or replace function public.erp_abc_history(
  p_ini date,
  p_fim date,
  p_store uuid default null,
  p_metric text default 'faturamento'
) returns table(
  product_id uuid, nome text, qtd numeric, faturamento numeric, custo numeric,
  pct numeric, pct_acum numeric, classe text, meses int
)
language sql security definer set search_path to 'public','pg_temp'
as $$
  with base as (
    select
      max(h.product_id::text)::uuid            as product_id,
      coalesce(max(p.nome), max(h.nome))       as nome,
      sum(h.qtd)                               as qtd,
      sum(h.faturamento)                       as fat,
      sum(h.custo)                             as custo,
      count(distinct h.ref_month)              as meses
    from product_sales_history h
    left join products p on p.id = h.product_id
    where h.ref_month between date_trunc('month', p_ini)::date and date_trunc('month', p_fim)::date
      and (is_admin() or h.store_id = my_store())
      and (p_store is null or h.store_id = p_store)
    group by coalesce(h.product_id::text, lower(btrim(h.nome)))
  ),
  metric as (
    select b.*, case when p_metric = 'qtd' then b.qtd else b.fat end as m from base b
  ),
  tot as (select nullif(sum(m),0) as t from metric),
  ranked as (
    select mt.*,
      round(mt.m/(select t from tot)*100, 2) as pct,
      round(sum(mt.m) over w/(select t from tot)*100, 2) as pct_acum,
      round((sum(mt.m) over w - mt.m)/(select t from tot)*100, 2) as pct_acum_ant
    from metric mt window w as (order by mt.m desc rows between unbounded preceding and current row)
  )
  select product_id, nome, qtd, fat as faturamento, round(custo,2) as custo,
    pct, pct_acum,
    case when pct_acum_ant < 80 then 'A' when pct_acum_ant < 95 then 'B' else 'C' end as classe,
    meses
  from ranked order by m desc;
$$;

revoke all on function public.erp_sales_history_import(jsonb, date, uuid) from public, anon;
revoke all on function public.erp_abc_history(date, date, uuid, text) from public, anon;
grant execute on function public.erp_sales_history_import(jsonb, date, uuid) to authenticated;
grant execute on function public.erp_abc_history(date, date, uuid, text) to authenticated;
