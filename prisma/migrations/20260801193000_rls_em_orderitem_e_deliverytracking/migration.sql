-- Fecha as duas últimas tabelas legíveis pela chave anon.
--
-- Pré-requisito, já cumprido no código: nenhum hook do front assina
-- postgres_changes. Todos passaram para Broadcast em canal por tenant
-- (src/lib/realtime.ts + src/lib/realtime-channel.ts). Enquanto o mapa do
-- cliente ainda lia DeliveryTracking direto, ligar RLS aqui teria quebrado o
-- rastreamento ao vivo — foi por isso que a migration anterior deixou explícito
-- que estas duas ficariam para depois.
--
-- Mesma forma das policies de 20260701135559: a role da aplicação tem BYPASSRLS
-- e continua enxergando tudo (o escopo por tenant é feito no Prisma Client); o
-- efeito prático é sobre anon/authenticated, que é justamente quem o navegador
-- usa. Como `app.current_tenant` nunca é definido nessas conexões, a policy não
-- libera linha nenhuma para elas.

ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OrderItem" USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "DeliveryTracking" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DeliveryTracking" USING ("tenantId" = current_setting('app.current_tenant', true));
