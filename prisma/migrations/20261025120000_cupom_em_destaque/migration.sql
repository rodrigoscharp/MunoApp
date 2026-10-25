-- O cupom que a loja anuncia no cardápio. Coluna nova com default: o código
-- anterior continua gravando cupons durante o deploy sem saber dela, e nenhuma
-- tabela nasce aqui, então não há RLS a ligar.
ALTER TABLE "Coupon" ADD COLUMN "destaque" BOOLEAN NOT NULL DEFAULT false;
