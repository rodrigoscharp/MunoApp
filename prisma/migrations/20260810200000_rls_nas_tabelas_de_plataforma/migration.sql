-- Fecha quatro tabelas que estavam abertas para a chave pública do Supabase.
--
-- O que foi encontrado em 10/08/2026, consultando produção:
--
--   * `anon` e `authenticated` têm SELECT, INSERT, UPDATE, DELETE e TRUNCATE
--     em TODAS as tabelas do schema public — é o grant padrão do Supabase.
--   * 14 tabelas estavam protegidas por RLS. Estas quatro não: Tenant, Lead,
--     LeadNote e PlatformAdmin.
--   * A API REST do Supabase responde 200 com a anon key, que vai no bundle do
--     navegador de todo cardápio.
--
-- Ou seja: qualquer visitante conseguia ler os administradores da plataforma
-- com o hash de senha, INSERIR um novo administrador — o que entrega o console
-- inteiro —, e apagar ou truncar restaurantes e o funil comercial.
--
-- A correção é ligar RLS SEM policy nenhuma. Sem policy permissiva, quem não
-- tem BYPASSRLS não enxerga linha alguma. Verificado em produção antes de
-- escrever: a aplicação conecta como `postgres` (rolbypassrls = t) e nada muda
-- para ela; `anon` e `authenticated` não têm bypass e ficam sem acesso.
--
-- Estas quatro não levam policy de tenant, ao contrário das outras 14: são
-- tabelas da plataforma, não de restaurante. `Tenant` e `PlatformAdmin` não
-- têm tenantId, e `Lead`/`LeadNote` são prospecção comercial da Muno. Ninguém
-- além da aplicação tem o que fazer nelas.

ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeadNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformAdmin" ENABLE ROW LEVEL SECURITY;
