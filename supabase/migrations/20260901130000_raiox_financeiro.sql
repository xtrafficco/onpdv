-- =====================================================================
-- Raio-X Financeiro — dataset único que alimenta o relatório profundo.
--
-- O relatório nasceu como uma planilha (abas CONTAS + RECEBIMENTOS) lida
-- no navegador. Esta função entrega a mesma estrutura de dados direto do
-- banco do ONPDV e ainda acrescenta o que a planilha não tinha: CMV
-- medido por item, valor de estoque a custo, taxa real de maquininha e
-- devoluções.
--
-- Retorno: { contas:[...], receitas:[...], meta:{...} }
--   contas[]   1 linha por parcela a pagar (+ transferências internas),
--              nos mesmos nomes de campo que o motor de análise espera.
--   receitas[] vendas agregadas por dia x loja x forma de pagamento.
--   meta{}     premissas medidas pelo sistema e cadastros auxiliares.
-- =====================================================================

create or replace function public.erp_raiox_dataset(p_store uuid default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
with
-- ---------------------------------------------------------------- contas
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
-- Transferência de mercadoria entre lojas: lançada na loja de DESTINO,
-- que é quem consome a mercadoria. O motor exclui este bloco do total de
-- despesas para não contar a mesma compra duas vezes.
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
contas as (
  select * from pag
  union all
  select * from tra
),
-- --------------------------------------------------------------- vendas
ven as (
  select
    s.id,
    s.total,
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
      s.forma_pagamento,
      'outros'))                                                              as fp
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
  from ven_rot
  group by 1,2,3
),
-- Faturamento histórico importado (mês fechado, sem detalhe de forma de
-- pagamento). Entra marcado com src='hist' e n=0 para não distorcer o
-- ticket médio; a interface deixa incluir ou não.
hist as (
  select
    h.ref_month                                                               as d,
    coalesce(nullif(st.nome,''), '—')                                         as loja,
    sum(h.faturamento)                                                        as v
  from product_sales_history h
  left join stores st on st.id = h.store_id
  where coalesce(h.faturamento,0) <> 0
    and (is_admin() or h.store_id = my_store())
    and (p_store is null or h.store_id = p_store)
    and not exists (           -- não duplica mês que já tem venda registrada no PDV
      select 1 from ven v2
      where date_trunc('month', v2.d)::date = h.ref_month
    )
  group by 1,2
),
-- ------------------------------------------------- CMV medido por item
cmv as (
  select
    to_char(v.d,'YYYY-MM')                                                    as ym,
    sum(si.qtd * coalesce(nullif(si.custo_unit,0), pr.custo, 0))
      filter (where coalesce(nullif(si.custo_unit,0), pr.custo, 0) > 0)       as cmv,
    sum(si.subtotal)
      filter (where coalesce(nullif(si.custo_unit,0), pr.custo, 0) > 0)       as rec_com_custo,
    sum(si.subtotal)                                                          as rec_itens
  from sale_items si
  join ven v on v.id = si.sale_id
  left join products pr on pr.id = si.product_id
  group by 1
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
  select coalesce(nullif(st.nome,''),'—')                                     as loja,
         sum(ss.saldo * coalesce(p.custo,0))                                  as valor,
         sum(ss.saldo)                                                        as unidades
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
      'venc',  to_char(c.venc,'YYYY-MM-DD'),
      'val',   c.val, 'juros', c.juros, 'pago', c.pago,
      'dtp',   to_char(c.dtp,'YYYY-MM-DD'),
      'cat',   c.cat, 'cc', c.cc
    ) order by c.venc) from contas c), '[]'::jsonb),
  'receitas', coalesce((
    select jsonb_agg(t.x order by t.x->>'d') from (
      select jsonb_build_object('d', to_char(r.d,'YYYY-MM-DD'), 'v', r.v,
                                'n', r.n, 'loja', r.loja, 'forma', r.forma,
                                'src', 'pdv') as x
      from rec r
      union all
      select jsonb_build_object('d', to_char(h.d,'YYYY-MM-DD'), 'v', h.v,
                                'n', 0, 'loja', h.loja,
                                'forma', '(histórico importado)', 'src', 'hist')
      from hist h
    ) t), '[]'::jsonb),
  'meta', jsonb_build_object(
    'empresa', (select nome from company_settings order by id limit 1),
    'lojas', coalesce((select jsonb_agg(jsonb_build_object('id',id,'nome',nome,'matriz',is_matriz)
                                        order by nome) from stores where ativo), '[]'::jsonb),
    'cmv_mes', coalesce((
      select jsonb_agg(jsonb_build_object('ym',ym,'cmv',coalesce(cmv,0),
                                          'rec_com_custo',coalesce(rec_com_custo,0),
                                          'rec_itens',coalesce(rec_itens,0)) order by ym)
      from cmv), '[]'::jsonb),
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
      'produtos_sem_custo', (select count(*) from products where ativo and coalesce(custo,0) <= 0)
    )
  )
);
$function$;

comment on function public.erp_raiox_dataset(uuid) is
  'Raio-X Financeiro: contas a pagar, transferências, receita agregada e premissas medidas pelo sistema.';

revoke all on function public.erp_raiox_dataset(uuid) from public;
grant execute on function public.erp_raiox_dataset(uuid) to authenticated;
