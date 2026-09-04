-- PIX no crediário: espelha o fluxo de PIX de entrega.
-- A edge pdv-pix-payment (kind='crediario') cria a intent com o payload em `recv`;
-- a fila mostra as cobranças aguardando/pagas; ao confirmar, erp_receivables_pay
-- quita as parcelas na sessão de caixa do operador e devolve o comprovante.

alter table public.pdv_pix_intents add column if not exists recv jsonb;

-- Fila de crediário aguardando/pago (só as ainda não confirmadas: sale_result is null)
create or replace function public.pdv_receivables_pix_queue(p_session uuid)
returns jsonb
language sql
stable security definer
set search_path to 'public','pg_temp'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'payment_id',i.mp_payment_id,'status',i.status,'amount',i.amount,
    'created_at',i.created_at,'customer_id',i.customer_id,'customer',coalesce(c.nome,'Cliente'),
    'phone',c.telefone,'qr_code',i.qr_code,'recv',i.recv
  ) order by (i.status='paid') desc,i.created_at),'[]'::jsonb)
  from public.pdv_pix_intents i
  left join public.customers c on c.id=i.customer_id
  where i.kind='crediario' and i.sale_result is null and i.status in ('pending','paid')
    and i.created_at>=now()-interval '2 days'
    and (p_session is null or i.session_id=p_session)
    and (i.operador=auth.uid() or public.is_admin())
$function$;

-- Confirma o recebimento do crediário pago por PIX: quita as parcelas via
-- erp_receivables_pay (na sessão do operador que confirma) e guarda o resultado.
create or replace function public.pdv_receivables_pix_finalize(p_intent uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  i public.pdv_pix_intents;
  r jsonb;
  v_res jsonb;
  v_ids uuid[];
  v_valor numeric;
  v_venc date;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória'; end if;
  select * into i from public.pdv_pix_intents where id=p_intent for update;
  if i.id is null or i.kind<>'crediario' then raise exception 'Cobrança PIX do crediário não encontrada'; end if;
  if i.operador is distinct from auth.uid() and not public.is_admin() then raise exception 'Sem permissão para este recebimento'; end if;
  if i.status<>'paid' then raise exception 'O PIX ainda não foi confirmado'; end if;
  if i.sale_result is not null then return i.sale_result; end if;
  r := coalesce(i.recv,'{}'::jsonb);
  select array_agg((x)::uuid) into v_ids
    from jsonb_array_elements_text(coalesce(r->'ids','[]'::jsonb)) x;
  if v_ids is null or coalesce(array_length(v_ids,1),0)=0 then
    raise exception 'Cobrança sem parcelas'; end if;
  v_valor := coalesce(nullif(r->>'valor','')::numeric, i.amount);
  v_venc  := nullif(r->>'venc_saldo','')::date;
  v_res := public.erp_receivables_pay(v_ids, 'pix', v_valor, v_venc);
  update public.pdv_pix_intents set sale_result=v_res, updated_at=now() where id=i.id;
  return v_res;
end
$function$;

-- Executáveis só por usuários autenticados (nunca anon/PUBLIC), como os de entrega.
revoke execute on function public.pdv_receivables_pix_queue(uuid) from public, anon;
revoke execute on function public.pdv_receivables_pix_finalize(uuid) from public, anon;
grant execute on function public.pdv_receivables_pix_queue(uuid) to authenticated;
grant execute on function public.pdv_receivables_pix_finalize(uuid) to authenticated;
