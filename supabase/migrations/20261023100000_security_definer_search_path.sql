-- ============================================================
-- search_path fixo nas funções SECURITY DEFINER do schema public
-- ============================================================
-- Função security definer sem search_path roda com o caminho de busca de quem
-- chama: um usuário que consiga criar objetos num schema anterior ao public
-- (ou em pg_temp) poderia sombrear uma tabela ou função e fazer a função, com
-- os privilégios do dono, usar o objeto dele. É o aviso
-- "function_search_path_mutable" do linter do Supabase.
--
-- 56 funções estavam assim (RLS helpers como auth_user_role, RPCs de rodada e
-- inscrição, triggers de plano). Todas só usam objetos do schema public e
-- auth.* (sempre qualificado), então `public, pg_temp` basta: pg_temp por
-- último para que objetos temporários nunca tenham precedência.
--
-- Não muda o corpo nem o comportamento de nenhuma função. As criadas depois
-- (alertas, grupos, relatórios, estatísticas) já nasceram com search_path.
--
-- Idempotente: a segunda execução não encontra nenhuma função sem search_path.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.prosecdef
       and (p.proconfig is null
            or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.fn);
  end loop;
end $$;
