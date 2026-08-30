-- RLS nas três tabelas do funil, sem policy nenhuma.
--
-- Mesma razão de 20260810200000_rls_nas_tabelas_de_plataforma: `anon` e
-- `authenticated` recebem SELECT, INSERT, UPDATE, DELETE e TRUNCATE em todo o
-- schema public por padrão do Supabase, e a API REST responde com a
-- NEXT_PUBLIC_SUPABASE_ANON_KEY, que vai no bundle do navegador de todo
-- cardápio. Tabela nova sem RLS nasce aberta para a internet, com escrita.
--
-- Sem policy é o certo aqui, e não uma omissão: não há tenantId por onde
-- escopar, e sem policy permissiva quem não tem BYPASSRLS não enxerga linha
-- alguma. A aplicação conecta como `postgres`, que tem BYPASSRLS, e nada muda
-- para ela.
--
-- O que estas tabelas guardam é justamente o que não pode vazar nem ser
-- escrito de fora: quanto tráfego a Muno tem, de onde ele vem, e quanto dele
-- vira cliente.

ALTER TABLE "SessaoFunil" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventoFunil" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResumoDiario" ENABLE ROW LEVEL SECURITY;
