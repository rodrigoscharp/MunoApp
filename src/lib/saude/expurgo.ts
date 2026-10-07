import { prismaUnscoped } from "@/lib/prisma";
import { LIMIARES } from "./limiares";

/** Apaga eventos de saúde com mais de 30 dias. Roda no cron diário. */
export async function expurgarEventosDeSaude(agora: Date): Promise<number> {
  const limite = new Date(agora.getTime() - LIMIARES.diasDeRetencao * 24 * 3_600_000);
  const { count } = await prismaUnscoped.eventoSistema.deleteMany({ where: { criadoEm: { lt: limite } } });
  return count;
}
