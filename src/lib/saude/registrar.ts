import type { NivelEvento, Prisma } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma";
import { semEmail } from "@/lib/observabilidade";

/**
 * O único ponto que escreve EventoSistema.
 *
 * Duas regras, as mesmas de registrarEvento do funil: nunca lança (gravar
 * saúde não pode derrubar um pagamento) e nunca leva dado pessoal (só ids e
 * contagens em `extra`; a mensagem passa por semEmail).
 *
 * Uma terceira, própria daqui: a falha de gravação NÃO chama reportarErro.
 * reportarErro chama esta função, e quando o problema é o banco isso viraria
 * um laço. A falha fica só no console.
 */
export type EventoDeSaude = {
  origem: string;
  nivel: NivelEvento;
  mensagem: string;
  tenantId?: string | null;
  extra?: Record<string, string | number | boolean | null | undefined>;
};

/** Um webhook não pode ficar preso esperando um banco lento só para registrar. */
const TIMEOUT_MS = 2000;

function semIndefinidos(extra: EventoDeSaude["extra"]): Prisma.InputJsonObject | undefined {
  if (!extra) return undefined;
  return Object.fromEntries(
    Object.entries(extra).filter(([, v]) => v !== undefined)
  ) as Prisma.InputJsonObject;
}

export async function registrarSaude(evento: EventoDeSaude): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const gravacao = prismaUnscoped.eventoSistema.create({
      data: {
        origem: evento.origem.slice(0, 200),
        nivel: evento.nivel,
        mensagem: semEmail(evento.mensagem).slice(0, 500),
        tenantId: evento.tenantId ?? null,
        extra: semIndefinidos(evento.extra),
      },
    });
    const limite = new Promise<never>((_, rejeitar) => {
      timer = setTimeout(() => rejeitar(new Error("timeout ao gravar evento de saúde")), TIMEOUT_MS);
    });
    await Promise.race([gravacao, limite]);
  } catch (erro) {
    // Só a classe do erro, como em coletar.ts: a mensagem do Prisma pode trazer
    // o SQL, e com ele os valores que se tentava gravar.
    console.error(
      `[saude] falha ao registrar ${evento.origem}`,
      erro instanceof Error ? erro.name : "erro"
    );
  } finally {
    clearTimeout(timer);
  }
}
