-- Observabilidade do caixa.
--
-- Ate aqui os erros nao tratados ficavam so em window.__onpdvErrors: 50 registros
-- em memoria que somem quando a aba fecha. Uma venda que falha em sincronizar as
-- 19h de sabado so virava informacao se alguem estivesse na frente da maquina.
--
-- O que entra aqui e deliberadamente pobre: versao, terminal, papel e a MENSAGEM
-- do erro. Nada de payload de venda, nada de dado de cliente. A decisao original
-- de nao mandar dados para fora continua valendo; o que muda e que a mensagem do
-- erro passa a chegar em quem pode agir.

create table if not exists public.client_error_log (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  store_id    uuid references public.stores(id),
  actor_id    uuid references public.app_users(id),
  papel       text,
  versao      text,
  terminal    text,
  kind        text not null,
  message     text not null,
  user_agent  text
);

create index if not exists client_error_log_created_idx
  on public.client_error_log (created_at desc);
create index if not exists client_error_log_actor_msg_idx
  on public.client_error_log (actor_id, message, created_at desc);

-- Tabela trancada: sem policy, como as demais de acesso exclusivo por RPC.
alter table public.client_error_log enable row level security;

-- Escrita: qualquer usuario autenticado registra o PROPRIO erro.
create or replace function public.log_client_error(
  p_kind       text,
  p_message    text,
  p_versao     text default null,
  p_terminal   text default null,
  p_user_agent text default null
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_msg   text;
  v_papel text;
  v_store uuid;
begin
  if v_actor is null then return; end if;

  v_msg := left(coalesce(nullif(btrim(p_message), ''), '(sem mensagem)'), 500);

  select u.papel, u.store_id into v_papel, v_store
    from public.app_users u where u.id = v_actor;

  -- Antiflood: um caixa em laco de erro nao pode inundar a tabela. A mesma
  -- mensagem, do mesmo usuario, no maximo uma vez a cada 5 minutos.
  if exists (
    select 1 from public.client_error_log e
     where e.actor_id = v_actor
       and e.message = v_msg
       and e.created_at > now() - interval '5 minutes'
  ) then
    return;
  end if;

  insert into public.client_error_log
    (store_id, actor_id, papel, versao, terminal, kind, message, user_agent)
  values
    (v_store, v_actor, v_papel, left(p_versao, 40), left(p_terminal, 40),
     left(coalesce(nullif(btrim(p_kind), ''), 'erro'), 40), v_msg,
     left(p_user_agent, 200));
end
$function$;

revoke execute on function public.log_client_error(text, text, text, text, text) from public, anon;
grant   execute on function public.log_client_error(text, text, text, text, text) to authenticated;

-- Leitura: so admin.
create or replace function public.erp_client_errors(p_dias integer default 7)
returns table (
  created_at timestamptz, loja text, papel text, versao text,
  terminal text, kind text, message text, ocorrencias bigint
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select max(e.created_at) as created_at,
         max(s.nome)       as loja,
         max(e.papel)      as papel,
         max(e.versao)     as versao,
         max(e.terminal)   as terminal,
         e.kind,
         e.message,
         count(*)          as ocorrencias
    from public.client_error_log e
    left join public.stores s on s.id = e.store_id
   where public.is_admin()
     and e.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_dias, 7), 90)))
   group by e.kind, e.message
   order by max(e.created_at) desc
   limit 500;
$function$;

revoke execute on function public.erp_client_errors(integer) from public, anon;
grant   execute on function public.erp_client_errors(integer) to authenticated;
