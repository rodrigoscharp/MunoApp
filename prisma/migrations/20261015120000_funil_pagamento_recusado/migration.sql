-- Dois degraus novos no funil, os dois só de servidor.
--
-- FOI_PARA_PAGAMENTO: /api/assinar obteve a URL da cobrança no Asaas e a
-- devolveu ao navegador. CHECKOUT_CRIADO sai antes do Asaas e não prova isso.
--
-- PAGAMENTO_RECUSADO: o webhook do Asaas avisou cartão recusado ou cobrança
-- reprovada pela análise de risco. Separa "desistiu na página de pagamento"
-- de "tentou pagar e não conseguiu".
--
-- Só ADD VALUE: o código antigo nunca grava esses valores, então o rollback
-- de deploy continua seguro.
ALTER TYPE "TipoEvento" ADD VALUE IF NOT EXISTS 'FOI_PARA_PAGAMENTO';
ALTER TYPE "TipoEvento" ADD VALUE IF NOT EXISTS 'PAGAMENTO_RECUSADO';
