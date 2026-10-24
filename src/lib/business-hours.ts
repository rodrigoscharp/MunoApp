import { z } from "zod";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { runWithTenant } from "@/lib/tenant-context";
import { reportarErro } from "@/lib/observabilidade";

export interface DaySchedule {
  open: boolean;
  from: string; // "HH:MM"
  to: string;   // "HH:MM"
}

export type WeekSchedule = Record<string, DaySchedule>;

export const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

/**
 * O que o PUT aceita gravar.
 *
 * A rota tinha `await req.json() as WeekSchedule` — cast de TypeScript, que não
 * existe em runtime — e gravava o resultado. Um corpo `{}` passava e apagava a
 * semana inteira: o cardápio voltava a exibir DEFAULT_SCHEDULE como se fosse o
 * horário escolhido pelo dono, e a loja abria e fechava no horário errado sem
 * ninguém ter mexido nisso.
 *
 * Exige os sete dias porque o formulário edita a semana como um bloco: corpo
 * com dias faltando não é edição parcial, é corpo malformado.
 */
const horaSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato HH:MM");

const daySchema = z.object({
  open: z.boolean(),
  from: horaSchema,
  to: horaSchema,
});

export const weekScheduleSchema = z.object(
  Object.fromEntries(DAY_KEYS.map((dia) => [dia, daySchema])) as Record<
    (typeof DAY_KEYS)[number],
    typeof daySchema
  >
);

export const DEFAULT_SCHEDULE: WeekSchedule = {
  monday:    { open: true, from: "11:00", to: "22:00" },
  tuesday:   { open: true, from: "11:00", to: "22:00" },
  wednesday: { open: true, from: "11:00", to: "22:00" },
  thursday:  { open: true, from: "11:00", to: "22:00" },
  friday:    { open: true, from: "11:00", to: "23:00" },
  saturday:  { open: true, from: "11:00", to: "23:00" },
  sunday:    { open: true, from: "11:00", to: "20:00" },
};

const DAY_INDEX_TO_KEY: Record<number, string> = {
  0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday",
  4: "thursday", 5: "friday", 6: "saturday",
};

function emMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * `to` menor ou igual a `from` significa que a janela atravessa a meia-noite:
 * 18:00–02:00 da hamburgueria, 11:00–00:00 da pizzaria. A janela pertence ao dia
 * em que ela começa, então 01:00 de terça ainda é o expediente de segunda — por
 * isso `herdadaDeOntem`, que só considera a sobra depois da virada.
 */
function dentroDaJanela(
  day: DaySchedule | undefined,
  nowMin: number,
  herdadaDeOntem: boolean
): boolean {
  if (!day?.open) return false;

  const from = emMinutos(day.from);
  const to = emMinutos(day.to);
  const viraODia = to <= from;

  if (herdadaDeOntem) return viraODia && nowMin < to;
  return viraODia ? nowMin >= from : nowMin >= from && nowMin < to;
}

export function checkIsOpen(schedule: WeekSchedule): boolean {
  // Horário de Brasília (UTC-3)
  const nowBRT = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const nowMin = nowBRT.getUTCHours() * 60 + nowBRT.getUTCMinutes();
  const hoje = nowBRT.getUTCDay();

  if (dentroDaJanela(schedule[DAY_INDEX_TO_KEY[hoje]], nowMin, false)) return true;

  const ontem = (hoje + 6) % 7;
  return dentroDaJanela(schedule[DAY_INDEX_TO_KEY[ontem]], nowMin, true);
}

/**
 * A tag do horário de UM restaurante. Global, a gravação do horário de uma
 * casa invalidava o de todas (mesma observação em src/lib/restaurant.ts).
 */
export function tagDoHorario(tenantId: string): string {
  return `business_hours:${tenantId}`;
}

async function lerBusinessHours(tenantId: string): Promise<WeekSchedule> {
  // Falha de banco propaga: dentro do unstable_cache, o horário padrão seria
  // guardado por 60s e a casa apareceria aberta ou fechada pelo padrão um
  // minuto depois de o banco voltar. Quem degrada é getBusinessHours, fora do
  // cache. JSON corrompido é dado, não falha passageira, e pode ficar em cache.
  const setting = await runWithTenant(tenantId, () =>
    prisma.setting.findUnique({ where: { tenantId_key: { tenantId, key: "business_hours" } } })
  );
  if (!setting) return DEFAULT_SCHEDULE;
  try {
    return { ...DEFAULT_SCHEDULE, ...JSON.parse(setting.value) };
  } catch {
    return DEFAULT_SCHEDULE;
  }
}

// Montado por chamada pelo mesmo motivo de getRestaurantInfo: tag e chave
// dependem do tenant.
//
// runWithTenant precisa envolver a chamada por fora do unstable_cache: se
// ficar só dentro do callback cacheado, o contexto do AsyncLocalStorage se
// perde antes da extensão de tenant do Prisma rodar (getCurrentTenantId()
// lança "Nenhum tenant no contexto da request"), e a query cai silenciosamente
// no catch, retornando o valor default.
export function getBusinessHours(tenantId: string): Promise<WeekSchedule> {
  const emCache = unstable_cache(() => lerBusinessHours(tenantId), ["business_hours", tenantId], {
    revalidate: 60,
    tags: [tagDoHorario(tenantId)],
  });
  return runWithTenant(tenantId, emCache).catch(async (erro) => {
    await reportarErro({ origem: "horario/leitura", erro, extra: { tenantId } });
    return DEFAULT_SCHEDULE;
  });
}
