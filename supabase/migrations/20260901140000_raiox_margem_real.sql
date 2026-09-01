-- =====================================================================
-- Raio-X Financeiro — margem bruta medida pelo sistema.
--
-- Até aqui o CMV do relatório saía de uma margem digitada à mão em
-- Premissas. Agora o próprio ONPDV mede a margem real, em três fontes,
-- da mais forte para a mais fraca:
--
--   1. itens_mes      sale_items com custo unitário registrado na venda.
--                     É a margem realizada de verdade, item a item.
--   2. historico_mes  product_sales_history × products.custo. Cobre as
--                     vendas importadas sem detalhe de item: sabe-se a
--                     quantidade vendida de cada produto e o custo dele,
--                     então a margem sai ponderada pelo giro real.
--   3. catalogo       products.preco × products.custo agregado. Não é
--                     ponderado por venda; só entra quando não há
--                     nenhuma venda custeada.
--
-- A interface escolhe, mês a mês, a melhor fonte disponível e só cai na
-- premissa manual se nenhuma das três existir.
-- =====================================================================

create or replace function public.erp_raiox_dataset(p_store uuid default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
with
pag as (
  select
    coalesce(nullif(st.nome,''), nullif(p.conta_bancaria,''), '—')            as conta,
    case p.status
      when 'paga'    then 'PAGA'
      when 'vencida' then 'EM ATRASO'
      else 'A VENCER'
    end                                                                       as status,
    coalesce(nullif(s.nome,''), nullif(p.fornecedor_nome,''),
             nullif(p.descricao,''), '—')                                     as forn,
    p.vencimento                                                              as venc,
    coalesce(p.valor, 0)                                                      as val,
    coalesce(p.juros, 0)                                                      as juros,
    coalesce(p.valor_pago, case when p.status = 'paga' then p.valor else 0 end) as pago,
    (p.pago_em at time zone 'America/Sao_Paulo')::date                         as dtp,
    coalesce(nullif(p.categoria,''), '(sem categoria)')                       as cat,
    coalesce(nullif(p.centro_custo,''), 'Outros')                             as cc
  from payables p
  left join suppliers s  on s.id  = p.supplier_id
  left join stores    st on st.id = p.store_id
  where p.vencimento is not null
    and (is_admin() or p.store_id = my_store())
    and (p_store is null or p.store_id = p_store)
),
tra as (
  select
    coalesce(nullif(sd.nome,''), '—')                                         as conta,
    'PAGA'                                                                    as status,
    'Transferência de ' || coalesce(nullif(so.nome,''), '—')                  as forn,
    coalesce(t.confirmed_at, t.created_at)::date                              as venc,
    coalesce(t.total_custo, 0)                                                as val,
    0::numeric                                                                as juros,
    coalesce(t.total_custo, 0)                                                as pago,
    coalesce(t.confirmed_at, t.created_at)::date                              as dtp,
    'Transferência interna de mercadoria'                                     as cat,
    'Transferência interna'                                                   as cc
  from transfers t
  left join stores so on so.id = t.origem_store
  left join stores sd on sd.id = t.destino_store
  where t.status = 'confirmado'
    and coalesce(t.total_custo, 0) <> 0
    and (is_admin() or t.destino_store = my_store() or t.origem_store = my_store())
    and (p_store is null or t.destino_store = p_store or t.origem_store = p_store)
),
contas as (select * from pag union all select * from tra),
ven as (
  select
    s.id, s.total,
    coalesce(nullif(st.nome,''), '—')                                         as loja,
    (s.created_at at time zone 'America/Sao_Paulo')::date                     as d,
    lower(coalesce(
      (select nullif(pr.tipo,'') from pos_payment_requests pr
        where pr.sale_id = s.id
          and coalesce(pr.status,'') not in ('cancelado','expirado','erro','recusado')
        order by pr.created_at desc limit 1),
      (select nullif(pm.metodo,'') from payments pm
        where pm.sale_id = s.id and pm.status = 'aprovado'
        order by pm.created_at desc limit 1),
      s.forma_pagamento, 'outros'))                                           as fp
  from sales s
  left join stores st on st.id = s.store_id
  where s.status <> 'cancelada'
    and coalesce(s.tipo_doc,'') <> 'orcamento'
    and s.created_at >= (current_date - interval '6 years')
    and (is_admin() or s.store_id = my_store())
    and (p_store is null or s.store_id = p_store)
),
ven_rot as (
  select v.*,
    case
      when v.fp like '%crediar%' or v.fp like '%carne%'  then 'Crediário'
      when v.fp like '%pix%'                             then 'PIX'
      when v.fp like '%dinh%' or v.fp like '%especie%'
        or v.fp like '%cash%'                            then 'Dinheiro'
      when v.fp like '%cred%'                            then 'Cartão de crédito'
      when v.fp like '%deb%'                             then 'Cartão de débito'
      when v.fp like '%cart%'                            then 'Cartão (tipo não informado)'
      when v.fp like '%vale%' or v.fp like '%gift%'      then 'Vale-presente'
      when v.fp like '%transf%'                          then 'Transferência bancária'
      else initcap(v.fp)
    end                                                                       as forma
  from ven v
),
rec as (
  select d, loja, forma, count(*)::int as n, sum(total) as v
  from ven_rot group by 1,2,3
),
hist as (
  select h.ref_month as d, coalesce(nullif(st.nome,''), '—') as loja, sum(h.faturamento) as v
  from product_sales_history h
  left join stores st on st.id = h.store_id
  where coalesce(h.faturamento,0) <> 0
    and (is_admin() or h.store_id = my_store())
    and (p_store is null or h.store_id = p_store)
    and not exists (select 1 from ven v2 where date_trunc('month', v2.d)::date = h.ref_month)
  group by 1,2
),
-- ============ margem medida: fonte 1, itens vendidos com custo ============
mg_itens as (
  select
    to_char(v.d,'YYYY-MM')                                                    as ym,
    sum(si.subtotal)
      filter (where coalesce(nullif(si.custo_unit,0), pr.custo, 0) > 0)       as receita,
    sum(si.qtd * coalesce(nullif(si.custo_unit,0), pr.custo, 0))
      filter (where coalesce(nullif(si.custo_unit,0), pr.custo, 0) > 0)       as cmv,
    sum(si.subtotal)                                                          as receita_itens
  from sale_items si
  join ven v on v.id = si.sale_id
  left join products pr on pr.id = si.product_id
  group by 1
),
-- ============ margem medida: fonte 2, giro histórico × custo do produto ====
mg_hist as (
  select
    to_char(h.ref_month,'YYYY-MM')                                            as ym,
    sum(h.faturamento)                                                        as receita,
    sum(h.qtd * p.custo)                                                      as cmv
  from product_sales_history h
  join products p on p.id = h.product_id
  where coalesce(p.custo,0) > 0
    and coalesce(h.faturamento,0) > 0
    and coalesce(h.qtd,0) > 0
    and (is_admin() or h.store_id = my_store())
    and (p_store is null or h.store_id = p_store)
  group by 1
),
-- ============ margem medida: fonte 3, catálogo (último recurso) ============
mg_cat as (
  select
    round((1 - sum(custo)/nullif(sum(preco),0)) * 100, 2)                      as pct,
    count(*)::int                                                             as produtos,
    (select count(*)::int from products where ativo and coalesce(custo,0) <= 0) as sem_custo
  from products
  where ativo and coalesce(custo,0) > 0 and coalesce(preco,0) > custo
),
mg_global as (
  select
    sum(receita) as receita, sum(cmv) as cmv,
    round((1 - sum(cmv)/nullif(sum(receita),0)) * 100, 2) as pct
  from (
    select receita, cmv from mg_itens where coalesce(receita,0) > 0
    union all
    -- não conta duas vezes o mês que já tem medição item a item
    select h.receita, h.cmv from mg_hist h
    where not exists (select 1 from mg_itens i where i.ym = h.ym and coalesce(i.receita,0) > 0)
  ) t
),
devol as (
  select to_char((sr.created_at at time zone 'America/Sao_Paulo')::date,'YYYY-MM') as ym,
         sum(sr.total) as v
  from sale_returns sr
  where sr.created_at >= (current_date - interval '6 years')
    and (is_admin() or sr.store_id = my_store())
    and (p_store is null or sr.store_id = p_store)
  group by 1
),
estoque as (
  select coalesce(nullif(st.nome,''),'—') as loja,
         sum(ss.saldo * coalesce(p.custo,0)) as valor,
         sum(ss.saldo) as unidades
  from store_stock ss
  join products p on p.id = ss.product_id
  left join stores st on st.id = ss.store_id
  where (is_admin() or ss.store_id = my_store())
    and (p_store is null or ss.store_id = p_store)
  group by 1
),
taxas as (
  select
    case when sum(transaction_amount) filter (where payment_type ilike '%credit%') > 0
      then round(100 * sum(coalesce(fee_amount,0)) filter (where payment_type ilike '%credit%')
                     / sum(transaction_amount) filter (where payment_type ilike '%credit%'), 2) end as cred,
    case when sum(transaction_amount) filter (where payment_type ilike '%debit%') > 0
      then round(100 * sum(coalesce(fee_amount,0)) filter (where payment_type ilike '%debit%')
                     / sum(transaction_amount) filter (where payment_type ilike '%debit%'), 2) end as deb,
    count(*)::int as n
  from mp_settlements
  where coalesce(status,'') in ('approved','accredited','aprovado')
)
select jsonb_build_object(
  'gerado_em', now(),
  'loja_filtro', p_store,
  'contas', coalesce((
    select jsonb_agg(jsonb_build_object(
      'conta', c.conta, 'status', c.status, 'forn', c.forn,
      'venc', to_char(c.venc,'YYYY-MM-DD'), 'val', c.val, 'juros', c.juros,
      'pago', c.pago, 'dtp', to_char(c.dtp,'YYYY-MM-DD'), 'cat', c.cat, 'cc', c.cc
    ) order by c.venc) from contas c), '[]'::jsonb),
  'receitas', coalesce((
    select jsonb_agg(t.x order by t.x->>'d') from (
      select jsonb_build_object('d', to_char(r.d,'YYYY-MM-DD'), 'v', r.v, 'n', r.n,
                                'loja', r.loja, 'forma', r.forma, 'src', 'pdv') as x
      from rec r
      union all
      select jsonb_build_object('d', to_char(h.d,'YYYY-MM-DD'), 'v', h.v, 'n', 0,
                                'loja', h.loja, 'forma', '(histórico importado)', 'src', 'hist')
      from hist h
    ) t), '[]'::jsonb),
  'meta', jsonb_build_object(
    'empresa', (select nome from company_settings order by id limit 1),
    'lojas', coalesce((select jsonb_agg(jsonb_build_object('id',id,'nome',nome,'matriz',is_matriz)
                                        order by nome) from stores where ativo), '[]'::jsonb),
    -- ---------- margem medida pelo sistema ----------
    'margem', jsonb_build_object(
      'itens_mes', coalesce((
        select jsonb_agg(jsonb_build_object('ym',ym,'receita',coalesce(receita,0),
                                            'cmv',coalesce(cmv,0),
                                            'receita_itens',coalesce(receita_itens,0)) order by ym)
        from mg_itens where coalesce(receita,0) > 0), '[]'::jsonb),
      'historico_mes', coalesce((
        select jsonb_agg(jsonb_build_object('ym',ym,'receita',receita,'cmv',cmv) order by ym)
        from mg_hist), '[]'::jsonb),
      'catalogo', (select jsonb_build_object('pct',pct,'produtos',produtos,'sem_custo',sem_custo) from mg_cat),
      'global', (select jsonb_build_object('pct',pct,'receita',coalesce(receita,0),
                                           'cmv',coalesce(cmv,0)) from mg_global),
      'receita_conhecida', coalesce((select sum(v) from rec),0) + coalesce((select sum(v) from hist),0)
    ),
    'devolucoes', coalesce((
      select jsonb_agg(jsonb_build_object('ym',ym,'valor',v) order by ym) from devol), '[]'::jsonb),
    'estoque', coalesce((
      select jsonb_agg(jsonb_build_object('loja',loja,'valor',coalesce(valor,0),
                                          'unidades',coalesce(unidades,0)) order by loja)
      from estoque), '[]'::jsonb),
    'taxa_cartao', (select jsonb_build_object('credito',cred,'debito',deb,'amostras',n) from taxas),
    'contagem', jsonb_build_object(
      'contas', (select count(*) from contas),
      'vendas', (select coalesce(sum(n),0) from rec),
      'produtos_sem_custo', (select sem_custo from mg_cat)
    )
  )
);
$function$;

comment on function public.erp_raiox_dataset(uuid) is
  'Raio-X Financeiro: contas a pagar, transferências, receita agregada, margem bruta medida e demais premissas apuradas pelo sistema.';

revoke all on function public.erp_raiox_dataset(uuid) from public;
grant execute on function public.erp_raiox_dataset(uuid) to authenticated;
