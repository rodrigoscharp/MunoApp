-- Declarações alimentares do prato, anuláveis e SEM default.
--
-- null quer dizer "o restaurante não informou". Um DEFAULT false marcaria todo
-- item existente como "sem glúten" e "sem lactose" no dia do deploy, sem
-- verificação nenhuma, e quem tem intolerância pediria confiando nisso.
--
-- Sem tabela nova, não há RLS a acrescentar: MenuItem já tem. A migração é
-- retrocompatível, porque o código antigo ignora as colunas.

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "containsGluten" BOOLEAN,
ADD COLUMN     "containsLactose" BOOLEAN,
ADD COLUMN     "isVegan" BOOLEAN;
