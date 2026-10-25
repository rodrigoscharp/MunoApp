-- A foto sem fundo do item, para o banner do cardápio. Coluna nova e nula: o
-- código anterior continua gravando itens sem saber dela, e nenhuma tabela
-- nasce aqui, então não há RLS a ligar.
ALTER TABLE "MenuItem" ADD COLUMN "imagemRecortadaUrl" TEXT;
