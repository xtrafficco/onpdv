-- erp_mark_sale_paid marca uma venda como paga. A guarda anterior era:
--
--   if not is_admin() and auth.uid() is not null
--      and not exists (select 1 from sales where id=p_sale and store_id=my_store())
--
-- Com um chamador sem identidade nenhuma (auth.uid() nulo), o segundo termo era
-- falso e a condicao inteira caia -- ou seja, passava direto, sem verificacao.
-- Era por ai que o pagseguro-webhook, publico e com service role key, conseguia
-- marcar qualquer venda como paga.
--
-- A regra agora e explicita e fecha por omissao:
--   * admin ................ qualquer venda
--   * usuario autenticado .. apenas vendas da propria loja
--   * service_role ......... permitido, mas porque foi declarado, nao por descuido
--   * qualquer outro ....... recusado
--
-- Verificado antes de aplicar: nenhum job do pg_cron, nenhuma outra funcao do
-- banco e nenhuma tela do frontend chamam esta RPC. anon nunca teve EXECUTE.
create or replace function public.erp_mark_sale_paid(
  p_sale uuid, p_metodo text, p_ref text default null::text
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is not null then
    if not is_admin()
       and not exists (select 1 from sales where id = p_sale and store_id = my_store()) then
      raise exception 'Sem permissão: venda de outra loja';
    end if;
  elsif coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Sem permissão: chamador não identificado';
  end if;

  update payments set status='aprovado',
      pagseguro_order_id = coalesce(p_ref, pagseguro_order_id), updated_at=now()
    where sale_id = p_sale and metodo = p_metodo;
  update sales set status='paga', paid_at=now() where id = p_sale and status='aberta';
end
$function$;

revoke execute on function public.erp_mark_sale_paid(uuid, text, text) from public, anon;
grant   execute on function public.erp_mark_sale_paid(uuid, text, text) to authenticated;
