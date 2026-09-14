-- pdv_save_terminal era a unica funcao SECURITY DEFINER do projeto executavel por
-- anon, contrariando a invariante documentada no README. Nao era exploravel (a
-- funcao exige auth.uid() e is_admin() na primeira linha), mas a defesa em
-- profundidade sumia e o advisor do Supabase acusava.
--
-- Alem do GRANT explicito para anon, a funcao ainda tinha o EXECUTE default para
-- PUBLIC. As demais funcoes do projeto seguem o padrao
-- {postgres, authenticated, service_role} -- esta migration alinha esta a ele.
revoke execute on function public.pdv_save_terminal(
  uuid, text, text, text, boolean, integer, uuid, uuid[]
) from public, anon;
