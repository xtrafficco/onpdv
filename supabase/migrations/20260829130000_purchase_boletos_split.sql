-- ONPDV - modulo Compras: grava os boletos do pedido como contas a pagar.
-- erp_po_create cria UMA conta a pagar (payables) por pedido. Quando o pedido tem
-- N boletos, esta RPC divide essa conta em N lancamentos (um por vencimento),
-- respeitando o intervalo escolhido. Idempotente por seguranca: so age enquanto a
-- conta original ainda esta 'aberta' e sem pagamento.
create or replace function public.erp_purchase_split_payable(
  p_po uuid,
  p_installments integer default 1,
  p_interval_days integer default 30,
  p_first_due date default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_n int := greatest(1, least(120, coalesce(p_installments, 1)));
  v_gap int := greatest(1, least(365, coalesce(p_interval_days, 30)));
  v_pay payables;
  v_first date;
  v_total numeric;
  v_base numeric;
  v_acc numeric := 0;
  v_val numeric;
  v_k int;
  v_desc text;
begin
  if not is_admin() then raise exception 'Apenas administrador'; end if;

  select p.* into v_pay from payables p
    join purchase_orders o on o.payable_id = p.id
   where o.id = p_po;
  if v_pay.id is null then
    select * into v_pay from payables where ref = 'PO:'||p_po::text order by created_at limit 1;
  end if;
  if v_pay.id is null then
    raise exception 'Conta a pagar do pedido nao encontrada';
  end if;
  if v_pay.status <> 'aberta' or v_pay.valor_pago is not null then
    return jsonb_build_object('installments', 1, 'skipped', true);
  end if;

  v_total := v_pay.valor;
  v_first := coalesce(p_first_due, v_pay.vencimento, current_date + 7);
  v_desc := coalesce(v_pay.fornecedor_nome, 'Compra');

  if v_n <= 1 then
    update payables set vencimento = v_first, descricao = 'Compra '||v_desc where id = v_pay.id;
    return jsonb_build_object('installments', 1);
  end if;

  v_base := round(v_total / v_n, 2);

  update payables set
    valor = v_base,
    vencimento = v_first,
    descricao = 'Compra '||v_desc||' - boleto 1/'||v_n
   where id = v_pay.id;
  v_acc := v_base;

  for v_k in 2..v_n loop
    if v_k = v_n then
      v_val := round(v_total - v_acc, 2);
    else
      v_val := v_base;
      v_acc := v_acc + v_base;
    end if;
    insert into payables (store_id, supplier_id, fornecedor_nome, descricao, valor, vencimento, status, origem, ref)
      values (v_pay.store_id, v_pay.supplier_id, v_pay.fornecedor_nome,
              'Compra '||v_desc||' - boleto '||v_k||'/'||v_n,
              v_val, v_first + ((v_k - 1) * v_gap), 'aberta', 'compra', v_pay.ref);
  end loop;

  return jsonb_build_object('installments', v_n, 'first_due', v_first, 'valor_boleto', v_base);
end $function$;

revoke all on function public.erp_purchase_split_payable(uuid, integer, integer, date) from public, anon;
grant execute on function public.erp_purchase_split_payable(uuid, integer, integer, date) to authenticated;
